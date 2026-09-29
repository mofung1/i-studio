package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// promptImage 是传给多模态模型的图片（base64 原文，不含 data URL 前缀）。
type promptImage struct {
	Mime string
	Data string
}

// promptCompleter 是文本改写的抽象，便于测试时替换成假实现。
type promptCompleter interface {
	complete(ctx context.Context, system string, userText string, images []promptImage, maxTokens int) (string, error)
	modelName() string
}

// deepseekClient 走 DeepSeek 的 OpenAI 兼容接口 /chat/completions，
// 只用于文本改写（提示词优化 / AI 帮写），不参与生图任务队列。
type deepseekClient struct {
	baseURL string
	apiKey  string
	model   string
	client  *http.Client
}

func newDeepSeekClient() *deepseekClient {
	seconds, err := time.ParseDuration(env("DEEPSEEK_TIMEOUT_SECONDS", "60") + "s")
	if err != nil || seconds <= 0 {
		seconds = 60 * time.Second
	}
	return &deepseekClient{
		baseURL: strings.TrimRight(env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/"),
		apiKey:  strings.TrimSpace(env("DEEPSEEK_API_KEY", "")),
		model:   env("DEEPSEEK_MODEL", "deepseek-flash"),
		client:  &http.Client{Timeout: seconds},
	}
}

func (c *deepseekClient) modelName() string { return c.model }

type chatContentPart map[string]any

// complete 发送一次非流式对话请求，返回模型输出的纯文本。
func (c *deepseekClient) complete(ctx context.Context, system string, userText string, images []promptImage, maxTokens int) (string, error) {
	parts := make([]chatContentPart, 0, len(images)+1)
	if strings.TrimSpace(userText) != "" {
		parts = append(parts, chatContentPart{"type": "text", "text": userText})
	}
	for _, image := range images {
		parts = append(parts, chatContentPart{
			"type": "image_url",
			// detail=low 会先把图缩到 512×512，改写提示词不需要原图细节，省 token 也更快
			"image_url": map[string]any{"url": fmt.Sprintf("data:%s;base64,%s", image.Mime, image.Data), "detail": "low"},
		})
	}

	body := map[string]any{
		"model": c.model,
		"messages": []any{
			map[string]any{"role": "system", "content": system},
			map[string]any{"role": "user", "content": parts},
		},
		"stream":     false,
		"max_tokens": maxTokens,
		// 改写任务要的是速度，显式关掉思考模式
		"thinking": map[string]any{"type": "disabled"},
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("encode request: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+c.apiKey)

	response, err := c.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("deepseek request failed: %w", err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return "", fmt.Errorf("read deepseek response: %w", err)
	}
	if response.StatusCode >= 300 {
		return "", fmt.Errorf("deepseek %s: %s", response.Status, providerErrorMessage(data))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return "", fmt.Errorf("decode deepseek response: %w; body=%s", err, responseSnippet(data))
	}
	if parsed.Error.Message != "" {
		return "", fmt.Errorf("deepseek error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("deepseek returned no choices")
	}
	return sanitizeModelText(parsed.Choices[0].Message.Content), nil
}

// sanitizeModelText 去掉模型偶尔带上的代码块围栏与首尾引号。
func sanitizeModelText(text string) string {
	trimmed := strings.TrimSpace(text)
	if strings.HasPrefix(trimmed, "```") {
		if index := strings.Index(trimmed, "\n"); index >= 0 {
			trimmed = trimmed[index+1:]
		}
		trimmed = strings.TrimSuffix(strings.TrimSpace(trimmed), "```")
		trimmed = strings.TrimSpace(trimmed)
	}
	return strings.Trim(trimmed, "\"'“”")
}
