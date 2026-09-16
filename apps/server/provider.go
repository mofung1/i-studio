package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"
	"time"
)

type providerTask struct {
	ID     string
	Status string
	Images []string
}

type imageProvider interface {
	Submit(context.Context, map[string]any) (providerTask, error)
	Poll(context.Context, string) (providerPollResult, error)
}

type providerPollResult struct {
	Status string
	Images []string
	Error  string
}

type bananaRouterProvider struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

func newBananaRouterProvider() *bananaRouterProvider {
	return &bananaRouterProvider{
		baseURL: strings.TrimRight(env("BANANA_ROUTER_BASE_URL", "https://api.bananarouter.com"), "/"),
		apiKey:  strings.TrimSpace(env("BANANA_ROUTER_API_KEY", "")),
		client:  &http.Client{Timeout: providerTimeout()},
	}
}

func (p *bananaRouterProvider) Submit(ctx context.Context, input map[string]any) (providerTask, error) {
	model := providerModelID(stringValue(input["model"], "gpt-image-2"))
	prompt := promptForInput(input)
	if prompt == "" {
		return providerTask{}, fmt.Errorf("generation prompt is required")
	}
	if strings.HasPrefix(model, "gemini-") {
		return p.submitGemini(ctx, model, prompt, input)
	}
	if images := sourceImages(input); len(images) > 0 {
		return p.submitOpenAIEdit(ctx, model, prompt, input, images)
	}
	return p.submitOpenAIGeneration(ctx, model, prompt, input)
}

func (p *bananaRouterProvider) submitGemini(ctx context.Context, model, prompt string, input map[string]any) (providerTask, error) {
	parts := []map[string]any{{"text": prompt}}
	for _, image := range sourceImages(input) {
		parts = append(parts, map[string]any{"inlineData": map[string]string{"mimeType": image["mime"], "data": image["data"]}})
	}
	generationConfig := map[string]any{"responseModalities": []string{"IMAGE"}, "imageConfig": map[string]any{"aspectRatio": stringValue(input["aspectRatio"], "1:1")}}
	if count := intValue(input["count"], 1); count > 1 {
		generationConfig["candidateCount"] = count
	}
	if size := stringValue(input["resolution"], ""); size != "" && size != "auto" {
		generationConfig["imageConfig"].(map[string]any)["imageSize"] = size
	}
	body := map[string]any{"contents": []any{map[string]any{"role": "user", "parts": parts}}, "generationConfig": generationConfig}
	return p.submitJSON(ctx, fmt.Sprintf("/v1beta/models/%s:generateContent", model), input, body, true)
}

func (p *bananaRouterProvider) submitOpenAIGeneration(ctx context.Context, model, prompt string, input map[string]any) (providerTask, error) {
	body := map[string]any{
		"model":  model,
		"prompt": prompt,
		"n":      intValue(input["count"], 1),
		"size":   openAISize(stringValue(input["aspectRatio"], "1:1"), stringValue(input["resolution"], "1K")),
	}
	return p.submitJSON(ctx, "/v1/images/generations/async", input, body, false)
}

func (p *bananaRouterProvider) submitOpenAIEdit(ctx context.Context, model, prompt string, input map[string]any, images []map[string]string) (providerTask, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for index, image := range images {
		data, err := base64.StdEncoding.DecodeString(image["data"])
		if err != nil {
			return providerTask{}, fmt.Errorf("decode source image %d: %w", index+1, err)
		}
		extension := extensionForMime(image["mime"])
		if extension == "" {
			return providerTask{}, fmt.Errorf("unsupported source image type %q", image["mime"])
		}
		filename := fmt.Sprintf("source-%d%s", index+1, extension)
		headers := make(textproto.MIMEHeader)
		headers.Set("Content-Disposition", fmt.Sprintf(`form-data; name="image"; filename="%s"`, filename))
		headers.Set("Content-Type", image["mime"])
		part, err := writer.CreatePart(headers)
		if err != nil {
			return providerTask{}, err
		}
		if _, err := part.Write(data); err != nil {
			return providerTask{}, err
		}
	}
	fields := map[string]string{
		"model":  model,
		"prompt": prompt,
		"n":      strconv.Itoa(intValue(input["count"], 1)),
		"size":   openAISize(stringValue(input["aspectRatio"], "1:1"), stringValue(input["resolution"], "1K")),
	}
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			return providerTask{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return providerTask{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/v1/images/edits/async", &body)
	if err != nil {
		return providerTask{}, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return p.sendProviderRequest(req, input, false)
}

func (p *bananaRouterProvider) submitJSON(ctx context.Context, path string, input map[string]any, body map[string]any, gemini bool) (providerTask, error) {
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return providerTask{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	return p.sendProviderRequest(req, input, gemini)
}

func (p *bananaRouterProvider) sendProviderRequest(req *http.Request, input map[string]any, gemini bool) (providerTask, error) {
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	if gemini {
		req.Header.Set("x-goog-api-key", p.apiKey)
	}
	req.Header.Set("Idempotency-Key", stringValue(input["taskId"], randomID()))
	resp, err := p.client.Do(req)
	if err != nil {
		return providerTask{}, fmt.Errorf("provider request %s %s: %w", req.Method, req.URL.Path, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return providerTask{}, fmt.Errorf("read provider response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return providerTask{}, fmt.Errorf("provider %s: %s", resp.Status, providerErrorMessage(data))
	}
	var payload struct {
		TaskID      string `json:"taskID"`
		TaskIDCamel string `json:"taskId"`
		TaskIDSnake string `json:"task_id"`
		Status      string `json:"status"`
		Data        []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		Candidates []struct {
			Content struct {
				Parts []struct {
					InlineData struct {
						MimeType string `json:"mimeType"`
						Data     string `json:"data"`
					} `json:"inlineData"`
					FileData struct {
						FileURI string `json:"fileUri"`
					} `json:"fileData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return providerTask{}, fmt.Errorf("decode provider response: %w; body=%s", err, responseSnippet(data))
	}
	images := providerResponseImages(payload.Data, payload.Candidates)
	if len(images) > 0 {
		return providerTask{Status: "success", Images: images}, nil
	}
	taskID := firstNonEmpty(payload.TaskID, payload.TaskIDCamel, payload.TaskIDSnake)
	if taskID == "" {
		return providerTask{}, fmt.Errorf("provider response missing taskID")
	}
	return providerTask{ID: taskID, Status: strings.ToLower(payload.Status)}, nil
}

func sourceImages(input map[string]any) []map[string]string {
	images, _ := input["sourceImages"].([]map[string]string)
	return images
}

func providerResponseImages(data []struct {
	URL     string `json:"url"`
	B64JSON string `json:"b64_json"`
}, candidates []struct {
	Content struct {
		Parts []struct {
			InlineData struct {
				MimeType string `json:"mimeType"`
				Data     string `json:"data"`
			} `json:"inlineData"`
			FileData struct {
				FileURI string `json:"fileUri"`
			} `json:"fileData"`
		} `json:"parts"`
	} `json:"content"`
}) []string {
	images := make([]string, 0, len(data)+len(candidates))
	for _, item := range data {
		if item.URL != "" {
			images = append(images, item.URL)
		} else if item.B64JSON != "" {
			images = append(images, "data:image/png;base64,"+item.B64JSON)
		}
	}
	for _, candidate := range candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData.Data != "" {
				mime := stringValue(part.InlineData.MimeType, "image/png")
				images = append(images, "data:"+mime+";base64,"+part.InlineData.Data)
			} else if part.FileData.FileURI != "" {
				images = append(images, part.FileData.FileURI)
			}
		}
	}
	return images
}

func (p *bananaRouterProvider) Poll(ctx context.Context, id string) (providerPollResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/v1/async-tasks/"+id, nil)
	if err != nil {
		return providerPollResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.client.Do(req)
	if err != nil {
		return providerPollResult{}, fmt.Errorf("provider poll %s: %w", req.URL.Path, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return providerPollResult{}, fmt.Errorf("read provider poll response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return providerPollResult{}, fmt.Errorf("provider poll %s: %s", resp.Status, providerErrorMessage(data))
	}
	var payload struct {
		Status            string          `json:"status"`
		ErrorMessage      string          `json:"errorMessage"`
		ErrorMessageSnake string          `json:"error_message"`
		FailureReason     string          `json:"failureReason"`
		FailureReasonAlt  string          `json:"failure_reason"`
		Message           string          `json:"message"`
		Error             json.RawMessage `json:"error"`
		ResultImages      []struct {
			URL string `json:"url"`
		} `json:"resultImages"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return providerPollResult{}, fmt.Errorf("decode provider poll response: %w; body=%s", err, responseSnippet(data))
	}
	images := make([]string, 0, len(payload.ResultImages))
	for _, image := range payload.ResultImages {
		if image.URL != "" {
			images = append(images, image.URL)
		}
	}
	errorMessage := firstNonEmpty(payload.ErrorMessage, payload.ErrorMessageSnake, payload.FailureReason, payload.FailureReasonAlt, payload.Message)
	if errorMessage == "" && len(payload.Error) > 0 && string(payload.Error) != "null" {
		errorMessage = providerErrorMessage(payload.Error)
	}
	if errorMessage == "" && strings.EqualFold(payload.Status, "failed") {
		errorMessage = providerErrorMessage(data)
	}
	return providerPollResult{Status: strings.ToLower(payload.Status), Images: images, Error: errorMessage}, nil
}

func providerErrorMessage(data []byte) string {
	var payload any
	if json.Unmarshal(data, &payload) == nil {
		if message := nestedProviderMessage(payload); message != "" {
			return message
		}
	}
	if snippet := responseSnippet(data); snippet != "" {
		return snippet
	}
	return "empty response body"
}

func nestedProviderMessage(value any) string {
	switch current := value.(type) {
	case string:
		return strings.TrimSpace(current)
	case map[string]any:
		for _, key := range []string{"message", "errorMessage", "error_message", "failureReason", "failure_reason", "reason", "detail", "error"} {
			if message := nestedProviderMessage(current[key]); message != "" {
				return message
			}
		}
	}
	return ""
}

func responseSnippet(data []byte) string {
	text := strings.TrimSpace(string(data))
	if len(text) > 500 {
		return text[:500] + "…"
	}
	return text
}

func openAISize(ratio, resolution string) string {
	if resolution == "auto" {
		return "auto"
	}
	parts := strings.Split(ratio, ":")
	if len(parts) != 2 {
		return "1024x1024"
	}
	portrait := parts[0] == "2" || parts[0] == "3" || parts[0] == "9"
	if resolution == "1K" {
		if portrait {
			return "1024x1536"
		}
		if ratio == "1:1" {
			return "1024x1024"
		}
		return "1536x1024"
	}
	if resolution == "2K" {
		switch ratio {
		case "2:3":
			return "1360x2048"
		case "3:4":
			return "1536x2048"
		case "9:16":
			return "1152x2048"
		case "4:3":
			return "2048x1536"
		case "16:9":
			return "2048x1152"
		default:
			return "2048x2048"
		}
	}
	switch ratio {
	case "2:3":
		return "2560x3840"
	case "3:4":
		return "2880x3840"
	case "9:16":
		return "2160x3840"
	case "4:3":
		return "3840x2880"
	case "16:9":
		return "3840x2160"
	default:
		return "2880x2880"
	}
}

func providerModelID(model string) string {
	switch model {
	case "gemini-3.1-flash-image":
		return "gemini-3.1-flash-image-preview"
	case "gemini-3-pro-image":
		return "gemini-3-pro-image-preview"
	default:
		return model
	}
}

// moduleHints 把模块标识翻译成自然语言生成指导，供模块化差异化生成使用。
var moduleHints = map[string]string{
	"hero":        "主视觉首图，突出商品主体与品牌调性，构图干净居中",
	"white":       "纯白底主图，商品居中、光影均匀，符合平台主图规范",
	"selling":     "卖点主图，围绕核心卖点构图，画面有清晰的信息层次",
	"scene":       "场景应用图，商品置于真实使用场景中，氛围自然",
	"detail":      "产品细节图，近景特写材质与工艺细节",
	"spec":        "规格参数图，清晰直观地展示商品规格信息",
	"feedback":    "用户反馈图，呈现真实使用场景与口碑氛围",
	"package":     "包装内容图，展示商品包装与配件全家福",
	"brand":       "品牌故事图，传达品牌调性与生活方式",
	"certificate": "品质认证图，突出品质保障与认证信息",
	"install":     "安装指引图，分步骤清晰展示安装过程",
	"faq":         "常见问题图，以画面解答用户疑虑",
	"size":        "尺码对照图，直观展示尺寸规格对比",
	"material":    "材质纹理图，特写材质质感与用料",
	"promotion":   "结尾促销图，营造促成购买的促销氛围",
}

// allowedModules 按任务类型限定 moduleCounts 可使用的模块 key。
var allowedModules = map[string]map[string]struct{}{
	"product-main": stringSet("hero", "white", "selling", "scene", "detail"),
	"detail-page":  stringSet("hero", "selling", "scene", "detail", "spec", "feedback", "package", "brand", "certificate", "install", "faq", "size", "material", "promotion"),
}

func promptForInput(input map[string]any) string {
	if prompt := strings.TrimSpace(stringValue(input["prompt"], "")); prompt != "" {
		return prompt
	}
	parts := []string{stringValue(input["productName"], "商品"), stringValue(input["requirements"], "专业电商产品图")}
	taskPrompts := map[string]string{"product-main": "商品主图", "detail-page": "电商详情页", "viral-recreate": "参考爆款视觉复刻", "product-retouch": "产品精修，保留真实商品外观"}
	if taskPrompt := taskPrompts[stringValue(input["taskType"], "")]; taskPrompt != "" {
		parts = append(parts, taskPrompt)
	}
	platforms := map[string]string{
		"smart": "适合目标平台", "taobao": "淘宝", "1688": "1688", "tmall": "天猫", "pinduoduo": "拼多多", "jd": "京东", "douyin": "抖音",
		"amazon": "Amazon", "temu": "TEMU", "ebay": "eBay",
	}
	if platform := platforms[stringValue(input["platform"], "")]; platform != "" {
		parts = append(parts, "适配"+platform+"平台商品图片")
	}
	languages := map[string]string{
		"zh-CN": "简体中文", "zh-TW": "繁体中文", "en": "英语", "ja": "日语", "ko": "韩语",
		"th": "泰语", "ms": "马来语", "id": "印尼语", "ru": "俄语",
	}
	if language := stringValue(input["outputLanguage"], ""); language == "none" {
		parts = append(parts, "纯视觉画面，不生成任何文字、字母或数字")
	} else if name := languages[language]; name != "" {
		parts = append(parts, "画面中如需文字，仅使用"+name)
	}
	if strength := stringValue(input["recreateStrength"], ""); strength == "high" {
		parts = append(parts, "高度复刻参考图的视觉结构，替换为商品原图")
	}
	if enhancements, ok := input["enhancements"].([]any); ok {
		parts = append(parts, "快捷优化项："+fmt.Sprint(enhancements))
	}
	// 模块化差异化生成：模块批次注入 moduleHint 时用自然语言指导，替代原始 map 拼接
	if hint := stringValue(input["moduleHint"], ""); hint != "" {
		parts = append(parts, "本组图片的生成方向："+hint)
	} else if counts, ok := input["moduleCounts"].(map[string]any); ok {
		parts = append(parts, "按以下模块生成详情素材："+fmt.Sprint(counts))
	}
	if scene := stringValue(input["sceneDescription"], ""); scene != "" {
		parts = append(parts, scene)
	}
	if points, ok := input["sellingPoints"].([]any); ok {
		for _, point := range points {
			if text, ok := point.(string); ok {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "。")
}
func stringValue(v any, fallback string) string {
	if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
		return s
	}
	return fallback
}
func intValue(v any, fallback int) int {
	switch n := v.(type) {
	case float64:
		if n > 0 {
			return int(n)
		}
	case int:
		if n > 0 {
			return n
		}
	}
	return fallback
}

func providerTimeout() time.Duration {
	seconds, err := strconv.Atoi(strings.TrimSpace(env("BANANA_ROUTER_TIMEOUT_SECONDS", "300")))
	if err != nil || seconds < 1 {
		seconds = 300
	}
	return time.Duration(seconds) * time.Second
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
