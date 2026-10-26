package studio

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func saveTestTemplate(t *testing.T, s *Service, key, content string, enabled, restore bool) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"key": key, "content": content, "enabled": enabled, "restoreDefault": restore})
	r := httptest.NewRequest(http.MethodPut, "/v1/prompt-templates", strings.NewReader(string(body)))
	r.Header.Set("Authorization", "Bearer "+s.testAdminToken(domain.User{ID: "template-admin"}))
	w := httptest.NewRecorder()
	s.promptTemplates(w, r)
	return w
}

func TestGenerationTemplateCatalogMigrationAndPersistence(t *testing.T) {
	for _, database := range []bool{false, true} {
		name := "file"
		if database {
			name = "postgres"
		}
		t.Run(name, func(t *testing.T) {
			s := testAIStore(t)
			if database {
				s.db = isolatedTestDatabase(t)
				if err := s.ai.migrateLegacy(); err != nil {
					t.Fatal(err)
				}
			}
			for _, key := range []string{"rewrite", "image.product-main", "module.detail-page.selling", "clothing.plan", "general.format"} {
				w := saveTestTemplate(t, s, key, "自定义保留内容", false, false)
				if w.Code != 200 {
					t.Fatal(w.Body.String())
				}
			}
			if err := s.ai.migrateLegacy(); err != nil {
				t.Fatal(err)
			}
			templates, err := s.promptSnapshot()
			if err != nil {
				t.Fatal(err)
			}
			seen := map[string]bool{}
			for _, template := range templates {
				if seen[template.Key] {
					t.Fatal("duplicate template", template.Key)
				}
				seen[template.Key] = true
				if template.DefaultContent == "" {
					t.Fatal("missing restore content", template.Key)
				}
				if template.Content == "自定义保留内容" && template.Enabled {
					t.Fatal("migration re-enabled a disabled template")
				}
			}
			for _, key := range []string{"retouch.background", "image.text.language", "image.clothing.model", "clothing.pose.4"} {
				if !seen[key] {
					t.Fatal("missing configurable path", key)
				}
			}
			fresh := &Service{db: s.db, secret: s.secret, storageRoot: s.storageRoot}
			fresh.ai = newAIConfigStore(fresh)
			snapshot, err := fresh.generationPromptSnapshot()
			if err != nil || snapshot["image.product-main"] != "" {
				t.Fatal("disabled content was lost on reload", err)
			}
			w := saveTestTemplate(t, fresh, "image.product-main", "", false, true)
			if w.Code != 200 {
				t.Fatal(w.Body.String())
			}
			snapshot, _ = fresh.generationPromptSnapshot()
			if snapshot["image.product-main"] != generationDefaults["image.product-main"] {
				t.Fatal("restore did not re-enable current default")
			}
		})
	}
}

func TestSavedGenerationPromptsReachBothProtocolsAndStayConsistentWithinGroup(t *testing.T) {
	for _, protocol := range []string{"openai_images", "gemini_native"} {
		t.Run(protocol, func(t *testing.T) {
			s := testAIStore(t)
			s.tasks = map[string]domain.GenerationTask{}
			for key, content := range map[string]string{"image.product-main": "自定义主图构图", "module.product-main.white": "自定义白底模块第一版"} {
				if w := saveTestTemplate(t, s, key, content, true, false); w.Code != 200 {
					t.Fatal(w.Body.String())
				}
			}
			var mu sync.Mutex
			prompts := []string{}
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
					w.WriteHeader(400)
					return
				}
				prompt, _ := body["prompt"].(string)
				if protocol == "gemini_native" {
					content := body["contents"].([]any)[0].(map[string]any)
					prompt = content["parts"].([]any)[0].(map[string]any)["text"].(string)
				}
				mu.Lock()
				prompts = append(prompts, prompt)
				first := len(prompts) == 1
				mu.Unlock()
				if first {
					if saved := saveTestTemplate(t, s, "module.product-main.white", "第二版将用于下一任务", true, false); saved.Code != 200 {
						t.Error(saved.Body.String())
					}
				}
				w.Header().Set("Content-Type", "application/json")
				if protocol == "gemini_native" {
					io.WriteString(w, `{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"aW1hZ2U="}}]}}]}`)
				} else {
					io.WriteString(w, `{"data":[{"b64_json":"aW1hZ2U="}]}`)
				}
			}))
			defer upstream.Close()
			endpoint := testEndpointInput("image", protocol)
			endpoint.BaseURL = "https://mock.example"
			s.aiHTTPClient = mockUpstreamClient(upstream)
			e, err := s.ai.save("", endpoint)
			if err != nil {
				t.Fatal(err)
			}
			s.provider = &dynamicImageProvider{server: s}
			input := map[string]any{"mode": "commerce", "taskType": "product-main", "requirements": "保留用户的商品要求", "model": e.Model, "endpointId": e.ID, "moduleMode": "custom", "moduleCounts": map[string]any{"white": float64(2)}, "count": float64(2)}
			input["protocolClient"] = s.imageProtocolClient(e, endpoint.APIKey)
			q := &taskQueue{server: s}
			images, _, err := q.generateBatches("group", input)
			if err != nil || len(images) != 2 {
				t.Fatal("generation failed", err)
			}
			if _, exists := input["generationPrompts"]; exists {
				t.Fatal("runtime settings leaked into task input")
			}
			input["moduleCounts"] = map[string]any{"white": float64(1)}
			input["count"] = float64(1)
			if _, _, err = q.generateBatches("next", input); err != nil {
				t.Fatal(err)
			}
			mu.Lock()
			defer mu.Unlock()
			if len(prompts) != 3 {
				t.Fatalf("unexpected request count %d", len(prompts))
			}
			for _, prompt := range prompts[:2] {
				for _, wanted := range []string{"自定义主图构图", "自定义白底模块第一版", "保留用户的商品要求"} {
					if !strings.Contains(prompt, wanted) {
						t.Fatal("saved template absent from protocol request", wanted, prompt)
					}
				}
				if strings.Contains(prompt, "第二版") {
					t.Fatal("settings changed halfway through a group")
				}
			}
			if !strings.Contains(prompts[2], "第二版将用于下一任务") {
				t.Fatal("next task did not see saved settings")
			}
		})
	}
}

func TestConfiguredModulesAlsoReachPromptEnhancement(t *testing.T) {
	s := testAIStore(t)
	if w := saveTestTemplate(t, s, "module.detail-page.selling", "自定义说明，突出已确认的颜色", true, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	r := newPromptRequestWithFields(t, "token", "写商品详情", 0, [][2]string{{"taskType", "detail-page"}, {"moduleMode", "custom"}, {"modules", "核心卖点图×1"}, {"moduleKeys", "selling×1"}})
	if err := r.ParseMultipartForm(maxPromptBodySize); err != nil {
		t.Fatal(err)
	}
	_, text, err := s.buildPrompt("requirements", "写商品详情", r)
	if err != nil || !strings.Contains(text, "突出已确认的颜色") || strings.Contains(text, "不以想象的原料") {
		t.Fatal("enhancement did not read saved module", text, err)
	}
}

func TestGeneralPromptEnhancementUsesGenerationSettingsWithoutCommerceContext(t *testing.T) {
	s := testAIStore(t)
	for key, content := range map[string]string{
		"image.style.handdrawn":  "仅用蓝色细线与平涂色块，不画写实阴影",
		"image.reference.low":    "以文字为主，仅借鉴参考配色",
		"image.reference.medium": "适度保留参考图片的视觉特征",
		"image.reference.high":   "保持参考人物的脸型与姿态",
	} {
		if w := saveTestTemplate(t, s, key, content, true, false); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	for _, test := range []struct {
		name, strength, want string
		images               int
	}{
		{"low", "low", "以文字为主，仅借鉴参考配色", 1},
		{"medium", "medium", "适度保留参考图片的视觉特征", 1},
		{"high", "high", "保持参考人物的脸型与姿态", 1},
		{"legacy default", "", "适度保留参考图片的视觉特征", 1},
		{"unknown strength", "unknown", "适度保留参考图片的视觉特征", 1},
		{"text only", "high", "", 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			original := "保留人物和姿态，变成蓝白插画，右侧写“周末”。"
			r := newPromptRequestWithFields(t, "token", original, test.images, [][2]string{
				{"style", "handdrawn"}, {"referenceStrength", test.strength},
				// Stale commerce options must not turn a general request into an ad.
				{"taskType", "product-retouch"}, {"platform", "amazon"}, {"outputLanguage", "en"},
				{"moduleMode", "custom"}, {"modules", "卖点主图×2"},
			})
			if err := r.ParseMultipartForm(maxPromptBodySize); err != nil {
				t.Fatal(err)
			}
			defer r.MultipartForm.RemoveAll()
			system, user, err := s.buildPrompt("prompt", original, r)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(user, "仅用蓝色细线与平涂色块") || !strings.HasSuffix(user, original) {
				t.Fatal("saved style or exact user text missing", user)
			}
			if test.want != "" && !strings.Contains(user, test.want) {
				t.Fatal("wrong reference instruction", user)
			}
			if test.images == 0 && strings.Contains(user, "参考要求：") {
				t.Fatal("text-only input claims to use an image", user)
			}
			for _, unwanted := range []string{"本次任务是产品精修", "本次是局部精修", "亚马逊", "文字语言：英文", "卖点主图×2"} {
				if strings.Contains(system+user, unwanted) {
					t.Fatal("commerce settings leaked into general optimization", unwanted)
				}
			}
		})
	}
}

func TestGeneralPromptEnhancementRespectsDisabledStylesAndStoredReferences(t *testing.T) {
	s := testAIStore(t)
	for _, key := range []string{"image.style.studio", "image.reference.high"} {
		if w := saveTestTemplate(t, s, key, "已停用的视觉要求", false, false); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	for _, strength := range []string{"high", "low"} {
		r := newPromptRequestWithFields(t, "token", "使用已选素材", 0, [][2]string{
			{"style", "studio"}, {"referenceStrength", strength},
			{"imagesSources", `[{"assetId":"owned-reference"}]`},
		})
		if err := r.ParseMultipartForm(maxPromptBodySize); err != nil {
			t.Fatal(err)
		}
		_, user, err := s.buildPrompt("prompt", "使用已选素材", r)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(user, "期望风格：") || strings.Contains(user, "已停用的视觉要求") {
			t.Fatal("disabled style was injected into optimization", user)
		}
		if got := strings.Contains(user, "参考要求："); got != (strength == "low") {
			t.Fatal("stored reference or disabled reference instruction not respected", user)
		}
	}
}

func TestConfigurableStyleRetouchClothingAndTextInstructions(t *testing.T) {
	s := testAIStore(t)
	saved := map[string]string{"image.style.studio": "自定义摄影棚指令", "image.reference.high": "自定义高参考强度", "retouch.background": "只清理墙面", "image.clothing.model": "保持眼镜人物", "clothing.style.natural": "窗边柔和自然光", "module.clothing-set.clothing-model": "展示用户确认的图案", "clothing.pose.1": "人物向右转身", "image.text.language": "文案只使用{{language}}"}
	for key, content := range saved {
		if w := saveTestTemplate(t, s, key, content, true, false); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	if w := saveTestTemplate(t, s, "retouch.color", "禁用色彩指令", false, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	templates, err := s.generationPromptSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		input            map[string]any
		wanted, unwanted string
	}{
		{map[string]any{"mode": "general", "prompt": "原始主题", "style": "studio", "referenceStrength": "high", "sourceImages": []map[string]string{{"role": "reference"}}}, "自定义高参考强度", "轻度视觉启发"},
		{map[string]any{"mode": "commerce", "taskType": "product-retouch", "enhancements": []any{"background", "color"}}, "只清理墙面", "禁用色彩指令"},
		{map[string]any{"mode": "commerce", "taskType": "clothing-set", "clothingMode": "model", "clothingStyle": "natural", "generationModule": "clothing-model", "moduleHint": "用户最终拍摄要求", "outputLanguage": "en"}, "窗边柔和自然光", "{{language}}"},
	}
	for _, test := range cases {
		test.input["generationPrompts"] = templates
		prompt := promptForInput(test.input)
		if !strings.Contains(prompt, test.wanted) || strings.Contains(prompt, test.unwanted) {
			t.Fatal("custom generation instruction missing", prompt)
		}
	}
	plan := baseClothingPlan("model", map[string]int{"clothing-model": 1}, "", templates)
	if !strings.Contains(plan.Shots[0].Description, "人物向右转身") || !strings.Contains(plan.Shots[0].Description, "展示用户确认的图案") {
		t.Fatal("manual/AI starter did not apply configured directions")
	}
}

func TestLocalFormattingUsesSavedTemplateWithoutCallingAI(t *testing.T) {
	s := testAIStore(t)
	client := &fakePromptClient{reply: "unexpected paid call"}
	s.promptClient = client
	if w := saveTestTemplate(t, s, "general.format", "整理：{{prompt}}；风格：{{style}}", true, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := saveTestTemplate(t, s, "image.style.studio", "棚拍设定", true, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	call := func(token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/v1/prompts/format", strings.NewReader(`{"text":"主题中保留{{style}}字样","style":"studio"}`))
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		s.formatPrompt(w, r)
		return w
	}
	if w := call(""); w.Code != 401 {
		t.Fatal("local formatting lacks authentication")
	}
	w := call(s.testToken(domain.User{ID: "member"}))
	var data struct{ Text string }
	_ = json.Unmarshal(w.Body.Bytes(), &data)
	if w.Code != 200 || data.Text != "整理：主题中保留{{style}}字样；风格：棚拍设定" || client.lastText != "" {
		t.Fatal("formatting re-expanded user input or called AI", w.Body.String())
	}
	if w := saveTestTemplate(t, s, "general.format", "{{unknown}}", true, false); w.Code != 400 {
		t.Fatal("unsupported variable accepted")
	}
	if w := saveTestTemplate(t, s, "general.format", "整理：{{prompt}}", false, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = call(s.testToken(domain.User{ID: "member"}))
	_ = json.Unmarshal(w.Body.Bytes(), &data)
	if data.Text != "主题中保留{{style}}字样" {
		t.Fatal("disabled local formatter discarded the original")
	}
}

type planPromptCapture struct{ system, user string }

func (p *planPromptCapture) modelName() string { return "mock" }

func (p *planPromptCapture) complete(_ context.Context, system, user string, _ []promptImage, _ int) (string, error) {
	p.system = system
	p.user = user
	plan := baseClothingPlan("model", map[string]int{"clothing-model": 2}, "")
	raw, _ := json.Marshal(plan)
	return string(raw), nil
}

func TestClothingPlannerUsesCustomTemplateAndFixedResponseContract(t *testing.T) {
	s := testAIStore(t)
	endpoint := testEndpointInput("prompt", "openai_chat")
	endpoint.Capabilities["vision"] = true
	if _, err := s.ai.save("", endpoint); err != nil {
		t.Fatal(err)
	}
	if w := saveTestTemplate(t, s, "clothing.plan", "自定义服装分析视角", true, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := saveTestTemplate(t, s, "clothing.pose.1", "自定义首张站姿", true, false); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	capture := &planPromptCapture{}
	s.promptClient = capture
	w := httptest.NewRecorder()
	s.clothingPlanHandler(w, clothingAnalysisRequest(t, s.testToken(domain.User{ID: "member"}), "model", true, false))
	if w.Code != 200 || !strings.Contains(capture.system, "自定义服装分析视角") || !strings.Contains(capture.system, "只返回 JSON") || !strings.Contains(capture.user, "自定义首张站姿") {
		t.Fatal("configured planner or fixed protocol was lost", w.Body.String())
	}
	w = httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/v1/generation/capabilities", nil)
	r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: "member"}))
	s.capabilities(w, r)
	if w.Code != 200 || strings.Contains(w.Body.String(), "自定义首张站姿") {
		t.Fatal("private defaults leaked through capabilities", w.Body.String())
	}
	w = httptest.NewRecorder()
	r = httptest.NewRequest("POST", "/v1/clothing/manual-plan", strings.NewReader(`{"mode":"model","counts":{"clothing-model":1},"requirements":""}`))
	r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: "member"}))
	s.manualClothingPlan(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "自定义首张站姿") {
		t.Fatal("manual shot plan lost saved defaults", w.Body.String())
	}
}
