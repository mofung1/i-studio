package studio

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

type promptUpstreamError struct {
	status        int
	kind, message string
}

func (e *promptUpstreamError) Error() string { return e.message }

type openAICompatibleClient struct {
	baseURL, apiKey, model string
	client                 *http.Client
	disableThinking        bool
}

func protocolHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
}

func newOpenAICompatibleClient(e endpointConfig, key string) *openAICompatibleClient {
	return &openAICompatibleClient{baseURL: strings.TrimRight(e.BaseURL, "/"), apiKey: key, model: e.Model, client: protocolHTTPClient(time.Duration(e.TimeoutSeconds) * time.Second)}
}

func (c *openAICompatibleClient) modelName() string { return c.model }

func (c *openAICompatibleClient) complete(ctx context.Context, system, userText string, images []promptImage, maxTokens int) (string, error) {
	parts := make([]map[string]any, 0, len(images)+1)
	if userText != "" {
		parts = append(parts, map[string]any{"type": "text", "text": userText})
	}
	for _, image := range images {
		detail := image.Detail
		if detail == "" {
			detail = "low"
		}
		parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": fmt.Sprintf("data:%s;base64,%s", image.Mime, image.Data), "detail": detail}})
	}
	var userContent any = userText
	if len(images) > 0 {
		userContent = parts
	}
	body := map[string]any{"model": c.model, "messages": []any{map[string]any{"role": "system", "content": system}, map[string]any{"role": "user", "content": userContent}}, "stream": false, "max_tokens": maxTokens}
	if c.disableThinking && strings.HasPrefix(c.model, "deepseek-") {
		body["thinking"] = map[string]any{"type": "disabled"}
	}
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, joinProtocolURL(c.baseURL, "chat/completions"), bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	resp, err := c.client.Do(req)
	if err != nil {
		var timeout net.Error
		if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
			return "", fmt.Errorf("prompt request timed out: %w", context.DeadlineExceeded)
		}
		return "", fmt.Errorf("OpenAI Compatible request failed: %s", safeAIError(err, c.apiKey))
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", &promptUpstreamError{status: resp.StatusCode, message: fmt.Sprintf("OpenAI Compatible %s: %s", resp.Status, safeAIError(fmt.Errorf("%s", providerErrorMessage(raw)), c.apiKey))}
	}
	var payload struct {
		Choices []struct {
			Message struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", err
	}
	if payload.Error.Message != "" {
		return "", errors.New(safeAIError(errors.New(payload.Error.Message), c.apiKey))
	}
	if len(payload.Choices) == 0 {
		return "", errors.New("API 未返回内容")
	}
	choice := payload.Choices[0]
	if choice.FinishReason == "length" {
		return "", &promptUpstreamError{kind: "length", message: "提示词输出达到模型长度上限"}
	}
	if choice.FinishReason == "content_filter" {
		return "", &promptUpstreamError{kind: "filter", message: "模型未能处理当前内容"}
	}
	var content string
	if err := json.Unmarshal(choice.Message.Content, &content); err != nil {
		var blocks []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(choice.Message.Content, &blocks); err != nil {
			return "", errors.New("API 返回的文字格式无法识别")
		}
		var text strings.Builder
		for _, block := range blocks {
			if block.Type == "text" {
				text.WriteString(block.Text)
			}
		}
		content = text.String()
	}
	content = sanitizeModelText(content)
	if strings.TrimSpace(content) == "" {
		return "", errors.New("API 未返回内容")
	}
	return content, nil
}

func joinProtocolURL(base, path string) string {
	base = strings.TrimRight(base, "/")
	path = strings.TrimLeft(path, "/")
	for _, version := range []string{"v1", "v1beta"} {
		if strings.HasSuffix(base, "/"+version) && strings.HasPrefix(path, version+"/") {
			path = strings.TrimPrefix(path, version+"/")
		}
	}
	return base + "/" + path
}

type dynamicPromptClient struct{ server *Service }

func (c *dynamicPromptClient) modelName() string {
	e, _ := c.server.ai.resolve("prompt", "", "")
	return e.Model
}

func (c *dynamicPromptClient) complete(ctx context.Context, system, userText string, images []promptImage, maxTokens int) (string, error) {
	e, err := c.server.ai.resolve("prompt", "", "")
	if err != nil {
		return "", err
	}
	key, err := c.server.ai.decrypt(e)
	if err != nil {
		return "", err
	}
	if len(images) > 0 && !e.Capabilities["vision"] {
		return "", errors.New("当前提示词模型不支持图片识别，请先输入大概的生图内容")
	}
	client := newOpenAICompatibleClient(e, key)
	client.disableThinking = true
	return client.complete(ctx, system, userText, images, maxTokens)
}

type dynamicImageProvider struct{ server *Service }

func (p *dynamicImageProvider) clientFor(input map[string]any) (imageProvider, error) {
	e, err := p.server.ai.resolve("image", stringValue(input["endpointId"], ""), stringValue(input["model"], ""))
	if err != nil {
		return nil, err
	}
	key, err := p.server.ai.decrypt(e)
	if err != nil {
		return nil, err
	}
	return newImageProtocolClient(e, key), nil
}

func (p *dynamicImageProvider) Submit(ctx context.Context, input map[string]any) (providerTask, error) {
	c, err := p.clientFor(input)
	if err != nil {
		return providerTask{}, err
	}
	return c.Submit(ctx, input)
}

func (p *dynamicImageProvider) Poll(context.Context, string) (providerPollResult, error) {
	return providerPollResult{}, errors.New("image endpoint requires task-specific client")
}

type openAIImageClient struct{ *imageProtocolTransport }

type geminiGenerateContentClient struct{ *imageProtocolTransport }

func newImageProtocolClient(e endpointConfig, key string) imageProvider {
	transport := &imageProtocolTransport{baseURL: strings.TrimRight(e.BaseURL, "/"), apiKey: key, model: e.Model, protocol: e.Protocol, standard: !e.Capabilities["async"], client: protocolHTTPClient(time.Duration(e.TimeoutSeconds) * time.Second)}
	if e.Protocol == "gemini_generate_content" {
		return &geminiGenerateContentClient{transport}
	}
	return &openAIImageClient{transport}
}
