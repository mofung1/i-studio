package studio

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/istudio/server/internal/repository"
	objectstore "github.com/istudio/server/internal/storage"
)

// This opt-in comparison run is never enabled by normal tests. It performs at
// most one paid gpt-image-2 POST per case and records both the image and the
// exact prompt. Run the same test from the pre-change commit to collect the old
// prompts and images. Source business configuration is read through a read-only
// DB connection; account, task, asset and ledger writes stay in an isolated test
// schema. Set ISTUDIO_LIVE_AB_SUITE=detail for the five detail-page cases.
func TestLivePromptAB(t *testing.T) {
	authorization, budgetCNY, maxPosts := "prompt-ab-ten-cases-budget-cny-2", 2, 10
	cases := promptABCases()
	if strings.TrimSpace(os.Getenv("ISTUDIO_LIVE_AB_SUITE")) == "detail" {
		authorization, budgetCNY, maxPosts = "detail-ab-five-cases-budget-cny-1", 1, 5
		cases = promptABDetailCases()
	}
	if os.Getenv("ISTUDIO_LIVE_AB_AUTHORIZATION") != authorization {
		t.Skip("explicit live A/B authorization not supplied")
	}
	root := os.Getenv("ISTUDIO_LIVE_PROJECT_ROOT")
	output := os.Getenv("ISTUDIO_LIVE_AB_OUTPUT")
	if !filepath.IsAbs(root) || !filepath.IsAbs(output) {
		t.Fatal("absolute project and output paths required")
	}
	s, model, endpointID := operationTestServer(t)
	s.storage = objectstore.NewLocal(s.storageRoot)
	u, err := url.Parse(os.Getenv("ISTUDIO_LIVE_SOURCE_DATABASE_URL"))
	if err != nil || u.Hostname() != "127.0.0.1" {
		t.Fatal("local source database required")
	}
	query := u.Query()
	query.Set("default_transaction_read_only", "on")
	u.RawQuery = query.Encode()
	sourceDB, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal("cannot open source database")
	}
	defer sourceDB.Close()
	sourceModel, err := resolveAvailableModel(sourceDB, "", "")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := sourceDB.BeginTx(context.Background(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	endpoint, err := resolveChannel(tx, sourceModel.ID)
	tx.Rollback()
	if err != nil {
		t.Fatal(err)
	}
	address, err := url.Parse(endpoint.BaseURL)
	if err != nil || address.Hostname() != "api.bananarouter.com" || endpoint.Protocol != "openai_images" || endpoint.Model != "gpt-image-2" {
		t.Fatal("live source differs from the reviewed image2 channel")
	}
	// Read only the encryption setting, never load or print all environment secrets.
	sourceKey := ""
	envData, _ := os.ReadFile(filepath.Join(root, "server/.env"))
	for _, line := range strings.Split(string(envData), "\n") {
		pair := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(pair) == 2 && pair[0] == "AI_CONFIG_ENCRYPTION_KEY" {
			sourceKey = strings.Trim(pair[1], "\"'")
		}
	}
	if sourceKey == "" {
		key, readErr := os.ReadFile(filepath.Join(root, "server/storage/uploads/.ai/encryption.key"))
		if readErr != nil || len(key) != 32 {
			t.Fatal("source encryption key unavailable; no paid calls made")
		}
		sourceKey = base64.StdEncoding.EncodeToString(key)
	}
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", sourceKey)
	key, err := s.ai.decrypt(endpoint)
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", "")
	if err != nil {
		t.Fatal("cannot decrypt source endpoint; no paid calls made")
	}
	_, err = s.ai.save(endpointID, endpointInput{Name: "Authorized prompt A/B", Purpose: "image", Protocol: endpoint.Protocol, BaseURL: endpoint.BaseURL, APIKey: key, Model: endpoint.Model, TimeoutSeconds: endpoint.TimeoutSeconds, Capabilities: endpoint.Capabilities, Enabled: true})
	if err != nil {
		t.Fatal("cannot prepare isolated live endpoint")
	}
	if _, err = s.db.Exec("UPDATE public_models SET price_minor=$1,name=$2 WHERE id=$3", sourceModel.PriceMinor, sourceModel.Name, model); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec("UPDATE public_model_channels SET upstream_model_id=$1 WHERE public_model_id=$2 AND is_active", endpoint.Model, model); err != nil {
		t.Fatal(err)
	}
	setPlatformSettings(t, s, `{"maxConcurrentTasks":16}`)
	client := protocolHTTPClient(time.Duration(endpoint.TimeoutSeconds) * time.Second)
	base := client.Transport
	capture := &promptABCapture{base: base, host: address.Hostname(), redactKey: key, t: t, expectedModel: endpoint.Model, maxPosts: maxPosts}
	client.Transport = capture
	preflight, err := http.NewRequestWithContext(context.Background(), http.MethodGet, joinProtocolURL(endpoint.BaseURL, "v1/models"), nil)
	if err != nil {
		t.Fatal("cannot build free preflight")
	}
	preflight.Header.Set("Authorization", "Bearer "+key)
	response, err := client.Do(preflight)
	if err != nil {
		t.Fatalf("free provider preflight failed before generation: %s", safeAIError(err, key))
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("free provider preflight returned HTTP %d; no generation submitted", response.StatusCode)
	}
	if os.Getenv("ISTUDIO_LIVE_PREFLIGHT_ONLY") == "1" {
		t.Log("free authenticated preflight passed; no generation submitted")
		return
	}
	s.aiHTTPClient = client
	s.provider = &dynamicImageProvider{server: s}

	files := map[string]string{
		"skincare": "web/public/images/marketing/ecommerce/skincare-base.webp",
		"perfume":  "web/public/images/marketing/ecommerce/amber-perfume.webp",
		"coffee":   "web/public/images/marketing/ecommerce/coffee-ritual.webp",
		"leather":  "web/public/images/marketing/ecommerce/leather-accessory.webp",
		"lamp":     "web/public/images/marketing/ecommerce/sculptural-light.webp",
		"retouch":  "web/public/images/commerce/retouch.webp",
	}
	for id, filename := range files {
		data, err := os.ReadFile(filepath.Join(root, filename))
		if err != nil {
			t.Fatal(err)
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		if err = s.storage.Save(id+".webp", bytes.NewReader(data)); err != nil {
			t.Fatal(err)
		}
		if _, err = s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes,width,height) VALUES($1,'member',$1,$2,'image/webp',$3,$4,$5)", id, id+".webp", len(data), config.Width, config.Height); err != nil {
			t.Fatal(err)
		}
	}
	if err = os.MkdirAll(output, 0700); err != nil {
		t.Fatal(err)
	}
	type result struct {
		Name     string `json:"name"`
		Tool     string `json:"tool"`
		Status   string `json:"status"`
		Prompt   string `json:"prompt"`
		File     string `json:"file,omitempty"`
		WallTime int64  `json:"wallTimeMs"`
		Error    string `json:"errorMessage,omitempty"`
	}
	filter := strings.TrimSpace(os.Getenv("ISTUDIO_LIVE_AB_CASES"))
	results := []result{}
	for _, testCase := range cases {
		if filter != "" && !strings.Contains(","+filter+",", ","+testCase.Name+",") {
			continue
		}
		input := promptABClone(testCase.Input)
		input["endpointId"] = model
		input["model"] = model
		if err := validateGenerationInput(input); err != nil {
			t.Fatal("invalid A/B scenario before any paid call", testCase.Name, err)
		}
		job, _, err := s.reserveGeneration("member", "prompt-ab-"+testCase.Name, sourceModel.PriceMinor, input)
		if err != nil {
			t.Fatal(testCase.Name, err)
		}
		before := capture.promptCount()
		started := time.Now()
		(&taskQueue{server: s}).processTask(job.ID)
		final, ok, err := repository.TaskByID(s.db, job.ID, "member")
		if err != nil || !ok {
			t.Fatal("cannot inspect A/B result")
		}
		s.attachBilling(&final)
		entry := result{Name: testCase.Name, Tool: testCase.Tool, Status: final.Status, Prompt: capture.promptSince(before), WallTime: time.Since(started).Milliseconds(), Error: final.ErrorMessage}
		if len(final.ResultImages) == 1 {
			var storageKey, mimeType string
			if err = s.db.QueryRow("SELECT storage_key,mime FROM assets WHERE task_id=$1", job.ID).Scan(&storageKey, &mimeType); err != nil {
				t.Fatal(err)
			}
			file, err := s.storage.Open(storageKey)
			if err != nil {
				t.Fatal(err)
			}
			data, err := io.ReadAll(file)
			file.Close()
			if err != nil {
				t.Fatal(err)
			}
			entry.File = testCase.Name + extensionForMime(mimeType)
			if err = os.WriteFile(filepath.Join(output, entry.File), data, 0600); err != nil {
				t.Fatal(err)
			}
		}
		results = append(results, entry)
		summary := map[string]any{
			"model": sourceModel.Name, "protocol": endpoint.Protocol, "maxPaidPosts": maxPosts,
			"attemptedGenerationPosts": capture.promptCount(), "authorizedBudgetCNY": budgetCNY,
			"estimatedTotalCNY": float64(capture.promptCount()) * 0.1,
			"costBasis":         "用户提供约 0.1 CNY/张估算；以供应商账单为准",
			"results":           results,
		}
		raw, _ := json.MarshalIndent(summary, "", "  ")
		if err = os.WriteFile(filepath.Join(output, "summary.json"), raw, 0600); err != nil {
			t.Fatal(err)
		}
		t.Logf("%s: %s, saved=%d, promptRunes=%d, elapsed=%ds, paid requests=%d/%d", testCase.Name, final.Status, len(final.ResultImages), len([]rune(entry.Prompt)), int(time.Since(started).Seconds()), capture.promptCount(), maxPosts)
		if final.Status != "succeeded" || len(final.ResultImages) != 1 {
			t.Errorf("live case %s did not deliver one image: %s", testCase.Name, final.ErrorMessage)
			return
		}
	}
}

type promptABCase struct {
	Name  string
	Tool  string
	Input map[string]any
}

func promptABClone(input map[string]any) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

// promptABCases covers the generation paths changed in this refactor:
// general, the four product-main shots, and product retouch. Requirements use
// the commerce field so the comparison matches what the workbench submits.
func promptABCases() []promptABCase {
	return []promptABCase{
		{
			Name: "01-general-studio", Tool: "general",
			Input: map[string]any{
				"mode": "general", "prompt": "极简摄影棚静物：一只白色陶瓷花瓶放在浅灰台面上，右侧柔光，背景干净，画面安静",
				"style": "studio", "referenceStrength": "medium", "aspectRatio": "1:1", "resolution": "2K", "count": float64(1),
			},
		},
		{
			Name: "02-general-handdrawn", Tool: "general",
			Input: map[string]any{
				"mode": "general", "prompt": "手绘插画：窗台上蜷着一只橘猫，蓝白配色，纸张有轻微纹理，画面安静",
				"style": "handdrawn", "referenceStrength": "medium", "aspectRatio": "4:3", "resolution": "2K", "count": float64(1),
			},
		},
		{
			Name: "03-general-reference-high", Tool: "general",
			Input: map[string]any{
				"mode": "general", "prompt": "把参考图里的香水瓶放入清爽的夏日广告画面，保留瓶身形状、琥珀色液体和金属瓶盖",
				"style": "unspecified", "referenceStrength": "high", "referenceAssetIds": []any{"perfume"},
				"aspectRatio": "3:4", "resolution": "2K", "count": float64(1),
			},
		},
		{
			Name: "04-main-white-amazon", Tool: "product-main",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"skincare"},
				"platform": "amazon", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"white": float64(1)}, "count": float64(1),
				"requirements": "只展示商品本身，包装文字保持原样，不添加新的文案或道具",
				"aspectRatio":  "1:1", "resolution": "2K",
			},
		},
		{
			Name: "05-main-hero-taobao", Tool: "product-main",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"coffee"},
				"platform": "taobao", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"hero": float64(1)}, "count": float64(1),
				"requirements": "突出咖啡包装的质感和品牌调性，画面明亮干净",
				"aspectRatio":  "1:1", "resolution": "2K",
			},
		},
		{
			Name: "06-main-scene-douyin", Tool: "product-main",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"leather"},
				"platform": "douyin", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"scene": float64(1)}, "count": float64(1),
				"requirements": "放在真实通勤场景里，竖版构图，商品清楚可辨",
				"aspectRatio":  "3:4", "resolution": "2K",
			},
		},
		{
			Name: "07-main-detail-smart", Tool: "product-main",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"lamp"},
				"platform": "smart", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"detail": float64(1)}, "count": float64(1),
				"requirements": "特写灯罩表面材质和接缝，保留真实纹理",
				"aspectRatio":  "1:1", "resolution": "2K",
			},
		},
		{
			Name: "08-main-smart-amazon", Tool: "product-main",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-main", "productAssetIds": []any{"perfume"},
				"platform": "amazon", "outputLanguage": "none", "moduleMode": "smart",
				"count": float64(1), "requirements": "干净的白底首图，商品居中完整，保留瓶身和标签",
				"aspectRatio": "1:1", "resolution": "2K",
			},
		},
		{
			Name: "09-retouch-basic", Tool: "product-retouch",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-retouch", "productAssetIds": []any{"retouch"},
				"enhancements": []any{}, "outputLanguage": "none",
				"requirements": "清理画面灰尘和杂乱背景，保持商品原样",
				"aspectRatio":  "3:4", "resolution": "2K", "count": float64(1),
			},
		},
		{
			Name: "10-retouch-repair-background", Tool: "product-retouch",
			Input: map[string]any{
				"mode": "commerce", "taskType": "product-retouch", "productAssetIds": []any{"skincare"},
				"enhancements": []any{"repair", "background"}, "outputLanguage": "none",
				"requirements": "只修复包装表面的划痕并净化背景，不改变商品形状和颜色",
				"aspectRatio":  "3:4", "resolution": "2K", "count": float64(1),
			},
		},
	}
}

// promptABDetailCases exercises the detail-page plan across visual and
// information modules. The same inputs are run against the pre-change commit so
// only the composed prompt differs between the two image sets.
func promptABDetailCases() []promptABCase {
	return []promptABCase{
		{
			Name: "11-detail-hero-taobao", Tool: "detail-page",
			Input: map[string]any{
				"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"skincare"},
				"platform": "taobao", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"hero": float64(1)}, "count": float64(1),
				"requirements": "首屏主视觉，完整展示护肤罐和包装盒，画面干净，为品牌信息留出空间",
				"aspectRatio":  "3:4", "resolution": "2K",
			},
		},
		{
			Name: "12-detail-spec-amazon", Tool: "detail-page",
			Input: map[string]any{
				"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"skincare"},
				"platform": "amazon", "outputLanguage": "zh-CN", "moduleMode": "custom",
				"moduleCounts": map[string]any{"spec": float64(1)}, "count": float64(1),
				"requirements": "规格参数图：净含量 50ml，包装尺寸 6.5×6.5×5.5cm，净重 60g。只排版这些已确认参数，不添加其他数字。",
				"aspectRatio":  "3:4", "resolution": "2K",
			},
		},
		{
			Name: "13-detail-scene-douyin", Tool: "detail-page",
			Input: map[string]any{
				"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"perfume"},
				"platform": "douyin", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"scene": float64(1)}, "count": float64(1),
				"requirements": "通勤场景，香水瓶放在木质台面上，竖版构图，商品清楚可辨，不添加其他商品",
				"aspectRatio":  "3:4", "resolution": "2K",
			},
		},
		{
			Name: "14-detail-material-smart", Tool: "detail-page",
			Input: map[string]any{
				"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"leather"},
				"platform": "smart", "outputLanguage": "none", "moduleMode": "custom",
				"moduleCounts": map[string]any{"material": float64(1)}, "count": float64(1),
				"requirements": "特写皮革表面纹理和缝线，保留真实材质和颜色",
				"aspectRatio":  "1:1", "resolution": "2K",
			},
		},
		{
			Name: "15-detail-promotion-smart", Tool: "detail-page",
			Input: map[string]any{
				"mode": "commerce", "taskType": "detail-page", "productAssetIds": []any{"coffee"},
				"platform": "smart", "outputLanguage": "zh-CN", "moduleMode": "custom",
				"moduleCounts": map[string]any{"promotion": float64(1)}, "count": float64(1),
				"requirements": "结尾促销图：到手价 79 元，活动截止 12 月 31 日。只使用这些已确认信息，不添加其他优惠。",
				"aspectRatio":  "3:4", "resolution": "2K",
			},
		},
	}
}

type promptABCapture struct {
	base          http.RoundTripper
	host          string
	redactKey     string
	t             *testing.T
	expectedModel string
	maxPosts      int
	mu            sync.Mutex
	prompts       []string
}

func (c *promptABCapture) promptCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.prompts)
}

func (c *promptABCapture) promptSince(index int) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if index < 0 || index >= len(c.prompts) {
		return ""
	}
	return c.prompts[index]
}

func (c *promptABCapture) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.URL.Hostname() != c.host {
		return nil, fmt.Errorf("live provider host changed")
	}
	if r.Method == http.MethodPost {
		if r.GetBody == nil {
			return nil, fmt.Errorf("cannot verify outgoing model before paid call")
		}
		body, err := r.GetBody()
		if err != nil {
			return nil, err
		}
		defer body.Close()
		prompt, actualModel, err := promptABRequestFields(r.Header.Get("Content-Type"), body)
		if err != nil {
			return nil, err
		}
		if actualModel != c.expectedModel {
			return nil, fmt.Errorf("outgoing model differs from authorized live model; no request sent")
		}
		c.mu.Lock()
		if len(c.prompts) >= c.maxPosts {
			c.mu.Unlock()
			return nil, fmt.Errorf("authorized ten-request cap reached")
		}
		c.prompts = append(c.prompts, prompt)
		c.mu.Unlock()
	}
	response, err := c.base.RoundTrip(r)
	if err != nil {
		c.t.Logf("provider network error: %s", safeAIError(err, c.redactKey))
		return response, err
	}
	if response.StatusCode >= 400 {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		response.Body.Close()
		response.Body = io.NopCloser(bytes.NewReader(data))
		c.t.Logf("provider HTTP %d: %s", response.StatusCode, safeAIError(fmt.Errorf("%s", providerErrorMessage(data)), c.redactKey))
	}
	return response, err
}

func promptABRequestFields(contentType string, body io.Reader) (string, string, error) {
	media, params, _ := mime.ParseMediaType(contentType)
	switch media {
	case "application/json":
		var payload struct {
			Model  string `json:"model"`
			Prompt string `json:"prompt"`
		}
		if err := json.NewDecoder(body).Decode(&payload); err != nil {
			return "", "", err
		}
		return payload.Prompt, payload.Model, nil
	case "multipart/form-data":
		reader := multipart.NewReader(body, params["boundary"])
		prompt, model := "", ""
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", "", err
			}
			switch part.FormName() {
			case "prompt":
				data, _ := io.ReadAll(io.LimitReader(part, 64<<10))
				prompt = string(data)
			case "model":
				data, _ := io.ReadAll(io.LimitReader(part, 201))
				model = string(data)
			}
			part.Close()
		}
		return prompt, model, nil
	default:
		return "", "", fmt.Errorf("unexpected live request content type %q", media)
	}
}
