package studio

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *Service) aiEndpoints(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	switch r.Method {
	case http.MethodGet:
		endpoints, err := s.ai.list()
		if err != nil {
			s.error(w, 500, "AI_CONFIG_STORAGE_ERROR", "AI 配置读取失败")
			return
		}
		list := []any{}
		for _, e := range endpoints {
			public, err := s.ai.public(e)
			if err != nil {
				s.error(w, 500, "AI_KEY_UNAVAILABLE", "无法解密 API Key，请恢复原加密密钥文件")
				return
			}
			list = append(list, public)
		}
		s.json(w, 200, map[string]any{"endpoints": list, "canManage": true})
	case http.MethodPost:
		if !s.requireSettingsUser(w, r) {
			return
		}
		var input endpointInput
		if !decode(r, &input) {
			s.error(w, 400, "AI_CONFIG_INVALID", "配置格式不正确")
			return
		}
		e, err := s.ai.save("", input)
		if err != nil {
			s.error(w, 400, "AI_CONFIG_INVALID", err.Error())
			return
		}
		public, err := s.ai.public(e)
		if err != nil {
			s.error(w, 500, "AI_KEY_UNAVAILABLE", "密钥读取失败")
			return
		}
		s.json(w, 201, map[string]any{"endpoint": public})
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *Service) aiEndpointByID(w http.ResponseWriter, r *http.Request) {
	if !s.requireSettingsUser(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/v1/ai-endpoints/"), "/")
	if len(parts) > 2 || parts[0] == "" {
		s.error(w, 404, "AI_ENDPOINT_NOT_FOUND", "服务不存在")
		return
	}
	id := parts[0]
	if len(parts) == 2 {
		if r.Method != http.MethodPost {
			s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
			return
		}
		switch parts[1] {
		case "default":
			if err := s.ai.mutate(id, false); err != nil {
				s.error(w, 400, "AI_CONFIG_INVALID", err.Error())
				return
			}
			s.json(w, 200, map[string]any{"success": true})
		case "test":
			s.testAIEndpoint(w, r, id)
		default:
			s.error(w, 404, "AI_ENDPOINT_NOT_FOUND", "服务不存在")
		}
		return
	}
	switch r.Method {
	case http.MethodPut:
		var input endpointInput
		if !decode(r, &input) {
			s.error(w, 400, "AI_CONFIG_INVALID", "配置格式不正确")
			return
		}
		if input.UpdatedAt == nil {
			s.error(w, 400, "AI_CONFIG_VERSION_REQUIRED", "请刷新配置后携带 updatedAt 保存")
			return
		}
		e, err := s.ai.save(id, input)
		if err != nil {
			if errors.Is(err, errEndpointConflict) {
				s.error(w, 409, "AI_CONFIG_CONFLICT", err.Error())
				return
			}
			s.error(w, 400, "AI_CONFIG_INVALID", err.Error())
			return
		}
		public, err := s.ai.public(e)
		if err != nil {
			s.error(w, 500, "AI_KEY_UNAVAILABLE", "密钥读取失败")
			return
		}
		s.json(w, 200, map[string]any{"endpoint": public})
	case http.MethodDelete:
		if err := s.ai.mutate(id, true); err != nil {
			s.error(w, 409, "AI_ENDPOINT_IN_USE", "服务仍有模型绑定，请先移除绑定后再删除")
			return
		}
		s.json(w, 200, map[string]any{"deleted": id})
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *Service) testAIEndpoint(w http.ResponseWriter, r *http.Request, id string) {
	endpoints, err := s.ai.list()
	if err != nil {
		s.error(w, 500, "AI_CONFIG_STORAGE_ERROR", "配置读取失败")
		return
	}
	var endpoint endpointConfig
	found := false
	for _, e := range endpoints {
		if e.ID == id {
			endpoint = e
			found = true
			break
		}
	}
	if !found {
		s.error(w, 404, "AI_ENDPOINT_NOT_FOUND", "服务不存在")
		return
	}
	key, err := s.ai.decrypt(endpoint)
	if err != nil {
		s.error(w, 500, "AI_KEY_UNAVAILABLE", "无法解密 API Key")
		return
	}
	var input struct {
		Mode            string `json:"mode"`
		ConfirmCost     bool   `json:"confirmCost"`
		AspectRatio     string `json:"aspectRatio"`
		Resolution      string `json:"resolution"`
		UpstreamModelID string `json:"upstreamModelId"`
	}
	if !decode(r, &input) || (input.Mode != "connection" && input.Mode != "generate") {
		s.error(w, 400, "TEST_INVALID", "请选择连接测试或真实生图测试")
		return
	}
	if input.AspectRatio == "" {
		input.AspectRatio = "1:1"
	}
	if input.Resolution == "" {
		input.Resolution = "1K"
	}
	_, ratioOK := allowedRatios[input.AspectRatio]
	_, resolutionOK := allowedResolutions[input.Resolution]
	if !ratioOK || !resolutionOK {
		s.error(w, 400, "TEST_PARAMETERS_INVALID", "请选择有效的比例与请求档位")
		return
	}
	if input.Mode == "generate" && !input.ConfirmCost {
		s.error(w, 400, "TEST_COST_CONFIRMATION_REQUIRED", "真实测试可能产生 API 费用，请明确确认")
		return
	}
	if input.UpstreamModelID != "" {
		endpoint.Model = strings.TrimSpace(input.UpstreamModelID)
	}
	if input.Mode == "generate" && (endpoint.Model == "" || len(endpoint.Model) > 200) {
		s.error(w, 400, "TEST_MODEL_REQUIRED", "请填写真实上游模型 ID")
		return
	}
	if !endpoint.Enabled {
		s.error(w, 409, "AI_ENDPOINT_DISABLED", "请先启用渠道")
		return
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(endpoint.TimeoutSeconds)*time.Second)
	defer cancel()
	images := []string{}
	if input.Mode == "connection" {
		path := "v1/models"
		if endpoint.Protocol == "gemini_native" {
			path = "v1beta/models"
		}
		req, requestErr := http.NewRequestWithContext(ctx, http.MethodGet, joinProtocolURL(endpoint.BaseURL, path), nil)
		err = requestErr
		if err == nil {
			if endpoint.Protocol == "gemini_native" {
				req.Header.Set("x-goog-api-key", key)
			} else {
				req.Header.Set("Authorization", "Bearer "+key)
			}
			client := protocolHTTPClient(time.Duration(endpoint.TimeoutSeconds) * time.Second)
			if s.aiHTTPClient != nil {
				client = s.aiHTTPClient
			}
			resp, requestErr := client.Do(req)
			err = requestErr
			if err == nil {
				raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
				resp.Body.Close()
				err = readErr
				if resp.StatusCode >= 300 {
					err = fmt.Errorf("连接测试 %s: %s", resp.Status, providerErrorMessage(raw))
				}
			}
		}
	} else if endpoint.Purpose == "prompt" {
		_, err = s.openAIProtocolClient(endpoint, key).complete(ctx, "Reply with OK.", "Connection test.", nil, 8)
	} else {
		var result providerTask
		result, err = s.imageProtocolClient(endpoint, key).Submit(ctx, map[string]any{"prompt": "A plain white square.", "model": endpoint.Model, "aspectRatio": input.AspectRatio, "resolution": input.Resolution, "count": 1})
		images = result.Images
	}
	elapsed := time.Since(start).Milliseconds()
	var measurement *imageMeasurement
	if input.Mode == "generate" && endpoint.Purpose == "image" {
		m := imageMeasurement{EndpointID: endpoint.ID, Model: endpoint.Model, AspectRatio: input.AspectRatio, Resolution: input.Resolution, ElapsedMS: elapsed, Currency: "CNY"}
		if err == nil && len(images) != 1 {
			err = fmt.Errorf("预期一张测试图片，实际返回 %d 张", len(images))
		}
		if err == nil {
			m.Width, m.Height, m.SizeBytes, err = actualImageDimensions(images[0])
		}
		m.Success = err == nil
		if err != nil {
			m.ErrorMessage = publicGenerationError(err.Error())
		}
		saved, saveErr := s.recordImageMeasurement(r, m)
		if saveErr != nil {
			s.error(w, 503, "MEASUREMENT_SAVE_FAILED", "测试已发起，但核验记录保存失败；请勿直接重复付费测试")
			return
		}
		measurement = &saved
	}
	payload := map[string]any{"measurement": measurement, "success": err == nil, "model": endpoint.Model, "responseTimeMs": time.Since(start).Milliseconds(), "images": images}
	if err != nil {
		payload["message"] = safeAIError(err, key)
	} else {
		if input.Mode == "generate" && endpoint.Purpose == "image" {
			payload["message"] = "生图成功"
		} else {
			payload["message"] = "连接成功"
		}
	}
	s.json(w, 200, payload)
}

func safeAIError(err error, key string) string {
	message := err.Error()
	if key != "" {
		message = strings.ReplaceAll(message, key, "[redacted]")
	}
	if len(message) > 600 {
		message = message[:600]
	}
	return message
}

func defaultPromptTemplates() []promptTemplate {
	now := time.Now().UTC()
	list := []promptTemplate{{Key: "rewrite", Name: "通用提示词优化", Category: "system", Content: promptRewriteSystemPrompt, Description: "配置 Prompt AI 后用于通用生图的 AI 优化，不直接发送给图片模型。"}, {Key: "requirements", Name: "电商提示词生成", Category: "system", Content: requirementSystemPrompt, Description: "电商 AI 帮写的基础指令，与所选任务的优化说明共同使用。"}}
	for _, key := range []string{"product-main", "detail-page", "viral-recreate", "product-retouch"} {
		list = append(list, promptTemplate{Key: key, Name: promptTaskTypeLabels[key], Category: "mode", Content: promptTaskGuidance[key], Description: "仅用于此任务的 AI 帮写；实际图片生成要求在电商生图分类中配置。"})
	}
	list = append(list, generationPromptDefinitions()...)
	list = append(list, reversePromptDefinitions()...)
	for i := range list {
		list[i].DefaultContent = list[i].Content
		list[i].Enabled = true
		list[i].SortOrder = i
		list[i].CreatedAt = now
		list[i].UpdatedAt = now
	}
	return list
}

func (s *Service) promptTemplates(w http.ResponseWriter, r *http.Request) {
	if !s.requireSettingsUser(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodGet {
		err := s.ai.withConfig(false, func(state *aiConfiguration) error {
			list := make([]promptTemplate, 0, len(state.Templates))
			for _, template := range state.Templates {
				list = append(list, templateMetadata(template))
			}
			s.json(w, 200, map[string]any{"templates": list})
			return nil
		})
		if err != nil {
			s.error(w, 500, "PROMPT_STORAGE_ERROR", "提示词配置读取失败")
		}
		return
	}
	if r.Method != http.MethodPut {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		Key            string `json:"key"`
		Content        string `json:"content"`
		Enabled        bool   `json:"enabled"`
		RestoreDefault bool   `json:"restoreDefault"`
	}
	if !decode(r, &input) || (!input.RestoreDefault && (strings.TrimSpace(input.Content) == "" || len([]rune(input.Content)) > 20000)) {
		s.error(w, 400, "PROMPT_TEMPLATE_INVALID", "提示词需为 1–20000 个字符")
		return
	}
	var result promptTemplate
	err := s.ai.withConfig(true, func(state *aiConfiguration) error {
		for i, t := range state.Templates {
			if t.Key == input.Key {
				if input.RestoreDefault {
					t.Content = t.DefaultContent
					t.Enabled = true
				} else {
					if err := validateTemplateVariables(t, input.Content); err != nil {
						return err
					}
					t.Content = input.Content
					t.Enabled = input.Enabled
				}
				t.UpdatedAt = time.Now().UTC()
				state.Templates[i] = t
				result = t
				return nil
			}
		}
		return errors.New("提示词模板不存在")
	})
	if err != nil {
		s.error(w, 400, "PROMPT_TEMPLATE_INVALID", err.Error())
		return
	}
	s.json(w, 200, map[string]any{"template": templateMetadata(result)})
}
