package studio

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
	"net/url"
	"strings"

	"github.com/istudio/server/internal/idgen"
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

type imageProtocolTransport struct {
	baseURL  string
	apiKey   string
	client   *http.Client
	protocol string
	model    string
	standard bool
}

func (p *imageProtocolTransport) Submit(ctx context.Context, input map[string]any) (providerTask, error) {
	model := stringValue(input["model"], "gpt-image-2")
	if p.model != "" {
		model = p.model
	}
	prompt := promptForInput(input)
	if prompt == "" {
		return providerTask{}, fmt.Errorf("generation prompt is required")
	}
	if p.protocol == "gemini_generate_content" {
		return p.submitGemini(ctx, model, prompt, input)
	}
	if images := sourceImages(input); len(images) > 0 {
		return p.submitOpenAIEdit(ctx, model, prompt, input, images)
	}
	return p.submitOpenAIGeneration(ctx, model, prompt, input)
}

func (p *imageProtocolTransport) submitGemini(ctx context.Context, model, prompt string, input map[string]any) (providerTask, error) {
	parts := []map[string]any{{"text": prompt}}
	for _, image := range sourceImages(input) {
		parts = append(parts, map[string]any{"inlineData": map[string]string{"mimeType": image["mime"], "data": image["data"]}})
	}
	// Gemini 图像生成文档不保证单次请求的精确图片数量。为保证用户
	// 选择的张数，多图统一由队列拆成多次单图调用，不依赖 candidateCount。
	generationConfig := map[string]any{"responseModalities": []string{"IMAGE"}, "imageConfig": map[string]any{"aspectRatio": stringValue(input["aspectRatio"], "1:1")}}
	if size := stringValue(input["resolution"], ""); size != "" && size != "auto" {
		generationConfig["imageConfig"].(map[string]any)["imageSize"] = size
	}
	body := map[string]any{"contents": []any{map[string]any{"role": "user", "parts": parts}}, "generationConfig": generationConfig}
	return p.submitJSON(ctx, fmt.Sprintf("/v1beta/models/%s:generateContent", url.PathEscape(model)), input, body, true)
}

func (p *imageProtocolTransport) submitOpenAIGeneration(ctx context.Context, model, prompt string, input map[string]any) (providerTask, error) {
	body := map[string]any{
		"model":  model,
		"prompt": prompt,
		"n":      1,
		"size":   openAISize(stringValue(input["aspectRatio"], "1:1"), stringValue(input["resolution"], "1K")),
	}
	path := "/v1/images/generations/async"
	if p.standard {
		path = "/v1/images/generations"
	}
	return p.submitJSON(ctx, path, input, body, false)
}

func (p *imageProtocolTransport) submitOpenAIEdit(ctx context.Context, model, prompt string, input map[string]any, images []map[string]string) (providerTask, error) {
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
		"n":      "1",
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
	path := "/v1/images/edits/async"
	if p.standard {
		path = "/v1/images/edits"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, joinProtocolURL(p.baseURL, path), &body)
	if err != nil {
		return providerTask{}, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return p.sendProviderRequest(req, input, false)
}

func (p *imageProtocolTransport) submitJSON(ctx context.Context, path string, input map[string]any, body map[string]any, gemini bool) (providerTask, error) {
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, joinProtocolURL(p.baseURL, path), bytes.NewReader(data))
	if err != nil {
		return providerTask{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	return p.sendProviderRequest(req, input, gemini)
}

func (p *imageProtocolTransport) sendProviderRequest(req *http.Request, input map[string]any, gemini bool) (providerTask, error) {
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	if gemini {
		req.Header.Set("x-goog-api-key", p.apiKey)
	}
	req.Header.Set("Idempotency-Key", stringValue(input["taskId"], idgen.New()))
	resp, err := p.client.Do(req)
	if err != nil {
		return providerTask{}, fmt.Errorf("AI request failed: %s", safeAIError(err, p.apiKey))
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return providerTask{}, fmt.Errorf("read provider response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return providerTask{}, fmt.Errorf("AI endpoint %s: %s", resp.Status, safeAIError(fmt.Errorf("%s", providerErrorMessage(data)), p.apiKey))
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
		return providerTask{}, fmt.Errorf("decode AI response: %w", err)
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

func (p *imageProtocolTransport) Poll(ctx context.Context, id string) (providerPollResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, joinProtocolURL(p.baseURL, "v1/async-tasks/"+id), nil)
	if err != nil {
		return providerPollResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	resp, err := p.client.Do(req)
	if err != nil {
		return providerPollResult{}, fmt.Errorf("AI poll failed: %s", safeAIError(err, p.apiKey))
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return providerPollResult{}, fmt.Errorf("read provider poll response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return providerPollResult{}, fmt.Errorf("AI poll %s: %s", resp.Status, safeAIError(fmt.Errorf("%s", providerErrorMessage(data)), p.apiKey))
	}
	var payload struct {
		Status            string          `json:"status"`
		StatusMessage     string          `json:"statusMessage"`
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
		return providerPollResult{}, fmt.Errorf("decode AI poll response: %w", err)
	}
	images := make([]string, 0, len(payload.ResultImages))
	for _, image := range payload.ResultImages {
		if image.URL != "" {
			images = append(images, image.URL)
		}
	}
	errorMessage := firstNonEmpty(payload.ErrorMessage, payload.ErrorMessageSnake, payload.FailureReason, payload.FailureReasonAlt)
	if errorMessage == "" && len(payload.Error) > 0 && string(payload.Error) != "null" {
		errorMessage = providerErrorMessage(payload.Error)
	}
	if errorMessage == "" {
		switch strings.ToLower(payload.Status) {
		case "failed", "cancelled", "expired":
			errorMessage = firstNonEmpty(strings.TrimSpace(payload.StatusMessage), strings.TrimSpace(payload.Message))
			if errorMessage == "" {
				errorMessage = providerErrorMessage(data)
			}
		}
	}
	return providerPollResult{Status: strings.ToLower(payload.Status), Images: images, Error: safeAIError(fmt.Errorf("%s", errorMessage), p.apiKey)}, nil
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
		for _, key := range []string{"message", "errorMessage", "error_message", "failureReason", "failure_reason", "reason", "detail", "error", "statusMessage"} {
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
	// Keep the largest exact aspect ratio on the 16-pixel grid within OpenAI's
	// 8,294,400-pixel and 3840-pixel edge limits, including non-widescreen 4K.
	switch ratio {
	case "2:3":
		return "2336x3504"
	case "3:4":
		return "2448x3264"
	case "9:16":
		return "2160x3840"
	case "4:3":
		return "3264x2448"
	case "16:9":
		return "3840x2160"
	default:
		return "2880x2880"
	}
}

// moduleHints 把模块标识翻译成自然语言生成指导，供模块化差异化生成使用。
var moduleHints = func() map[string]string {
	hints := map[string]string{}
	for key := range allowedModules["detail-page"] {
		hints[key] = generationDefaults["module.detail-page."+key]
	}
	for key := range allowedModules["product-main"] {
		hints[key] = generationDefaults["module.product-main."+key]
	}
	return hints
}()

// moduleLabel 取模块的中文名（moduleHints 的第一段），用于错误信息等面向用户的位置，
// 避免把内部 key（如 selling）直接暴露给用户。
func moduleLabel(key string) string {
	if label, _ := clothingModule(key); label != "" {
		return label
	}
	hint := strings.TrimSpace(moduleHints[strings.TrimSpace(key)])
	if hint == "" {
		return key
	}
	if index := strings.Index(hint, "，"); index >= 0 {
		return hint[:index]
	}
	return hint
}

// allowedModules 按任务类型限定 moduleCounts 可使用的模块 key。
var allowedModules = map[string]map[string]struct{}{
	"product-main": stringSet("hero", "white", "selling", "scene", "detail"),
	"detail-page":  stringSet("hero", "selling", "scene", "detail", "spec", "feedback", "package", "brand", "certificate", "install", "faq", "size", "material", "promotion"),
}

func promptForInput(input map[string]any) string {
	if stringValue(input["taskType"], "") == "clothing-set" {
		return clothingPromptForInput(input)
	}
	mode := stringValue(input["mode"], "")
	if mode == "commerce" || (mode == "" && stringValue(input["taskType"], "") != "") {
		return commercePromptForInput(input)
	}
	prompt := strings.TrimSpace(stringValue(input["prompt"], ""))
	if prompt == "" {
		return ""
	}
	parts := []string{prompt}
	style := stringValue(input["style"], "unspecified")
	if style != "unspecified" && promptStyleLabels[style] != "" {
		parts = append(parts, generationText(input, "image.style."+style))
	}
	if input["mode"] == "general" && len(sourceImages(input)) > 0 {
		parts = append(parts, generationText(input, "image.reference."+stringValue(input["referenceStrength"], "medium")))
	}
	return joinPromptParts(parts, "。")
}

func appendCommerceTextPolicy(parts *[]string, input map[string]any) {
	if stringValue(input["mode"], "") != "commerce" && stringValue(input["taskType"], "") == "" {
		return
	}
	languages := map[string]string{
		"zh-CN": "简体中文", "zh-TW": "繁体中文", "en": "英语", "ja": "日语", "ko": "韩语",
		"th": "泰语", "ms": "马来语", "id": "印尼语", "ru": "俄语",
	}
	language := stringValue(input["outputLanguage"], "")
	if language == "" || stringValue(input["taskType"], "") == "product-retouch" {
		language = "none"
	}
	if language == "none" {
		*parts = append(*parts, generationText(input, "image.text.none"))
	} else if name := languages[language]; name != "" {
		*parts = append(*parts, renderPrompt(generationText(input, "image.text.language"), map[string]string{"language": name}))
	}
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

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
