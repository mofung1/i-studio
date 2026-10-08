package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
)

func (s *server) aiEndpoints(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
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
		admin := s.canManageAI(uid)
		for _, e := range endpoints {
			if admin {
				public, err := s.ai.public(e)
				if err != nil {
					s.error(w, 500, "AI_KEY_UNAVAILABLE", "无法解密 API Key，请恢复原加密密钥文件")
					return
				}
				list = append(list, public)
			} else if e.Enabled {
				list = append(list, map[string]any{"id": e.ID, "name": e.Name, "purpose": e.Purpose, "protocol": e.Protocol, "model": e.Model, "capabilities": e.Capabilities, "enabled": true, "isDefault": e.IsDefault})
			}
		}
		s.json(w, 200, map[string]any{"endpoints": list, "canManage": admin})
	case http.MethodPost:
		if !s.requireAIAdmin(w, r) {
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

func (s *server) aiEndpointByID(w http.ResponseWriter, r *http.Request) {
	if !s.requireAIAdmin(w, r) {
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
		e, err := s.ai.save(id, input)
		if err != nil {
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
			s.error(w, 404, "AI_ENDPOINT_NOT_FOUND", "服务不存在或删除失败")
			return
		}
		s.json(w, 200, map[string]any{"deleted": id})
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *server) testAIEndpoint(w http.ResponseWriter, r *http.Request, id string) {
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
	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(endpoint.TimeoutSeconds)*time.Second)
	defer cancel()
	if endpoint.Purpose == "prompt" {
		_, err = newOpenAICompatibleClient(endpoint, key).complete(ctx, "Reply with OK.", "Connection test.", nil, 8)
	} else {
		client := newImageProtocolClient(endpoint, key)
		var result providerTask
		result, err = client.Submit(ctx, map[string]any{"prompt": "A plain white square.", "model": endpoint.Model, "aspectRatio": "1:1", "resolution": "1K", "count": 1})
		if err == nil && len(result.Images) == 0 {
			ticker := time.NewTicker(time.Second)
			defer ticker.Stop()
			for err == nil && len(result.Images) == 0 {
				select {
				case <-ctx.Done():
					err = ctx.Err()
				case <-ticker.C:
					polled, pollErr := client.Poll(ctx, result.ID)
					if pollErr != nil {
						err = pollErr
						break
					}
					if polled.Status == "failed" || polled.Status == "cancelled" || polled.Status == "expired" {
						err = errors.New(polled.Error)
						break
					}
					result.Images = polled.Images
				}
			}
		}
	}
	payload := map[string]any{"success": err == nil, "model": endpoint.Model, "responseTimeMs": time.Since(start).Milliseconds()}
	if err != nil {
		payload["message"] = safeAIError(err, key)
	} else {
		payload["message"] = "连接成功"
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
	list := []promptTemplate{{Key: "rewrite", Name: "通用提示词优化", Category: "system", Content: promptRewriteSystemPrompt}, {Key: "requirements", Name: "电商提示词生成", Category: "system", Content: requirementSystemPrompt}}
	for _, key := range []string{"product-main", "detail-page", "viral-recreate", "product-retouch"} {
		list = append(list, promptTemplate{Key: key, Name: promptTaskTypeLabels[key], Category: "mode", Content: promptTaskGuidance[key]})
	}
	for i := range list {
		list[i].DefaultContent = list[i].Content
		list[i].Enabled = true
		list[i].SortOrder = i
		list[i].CreatedAt = now
		list[i].UpdatedAt = now
	}
	return list
}

func (s *server) promptTemplates(w http.ResponseWriter, r *http.Request) {
	if !s.requireAIAdmin(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodGet {
		err := s.ai.withConfig(false, func(state *aiConfiguration) error {
			s.json(w, 200, map[string]any{"templates": state.Templates})
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
	s.json(w, 200, map[string]any{"template": result})
}
