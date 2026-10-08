package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type openAICompatibleClient struct {
	baseURL, apiKey, model string
	client                 *http.Client
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
		parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": fmt.Sprintf("data:%s;base64,%s", image.Mime, image.Data), "detail": "low"}})
	}
	body := map[string]any{"model": c.model, "messages": []any{map[string]any{"role": "system", "content": system}, map[string]any{"role": "user", "content": parts}}, "stream": false, "max_tokens": maxTokens}
	data, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, joinProtocolURL(c.baseURL, "chat/completions"), bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("OpenAI Compatible request failed: %s", safeAIError(err, c.apiKey))
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("OpenAI Compatible %s: %s", resp.Status, safeAIError(fmt.Errorf("%s", providerErrorMessage(raw)), c.apiKey))
	}
	var payload struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
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
	if len(payload.Choices) == 0 || strings.TrimSpace(payload.Choices[0].Message.Content) == "" {
		return "", errors.New("API 未返回内容")
	}
	return sanitizeModelText(payload.Choices[0].Message.Content), nil
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

type dynamicPromptClient struct{ server *server }

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
	return newOpenAICompatibleClient(e, key).complete(ctx, system, userText, images, maxTokens)
}

type dynamicImageProvider struct{ server *server }

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
