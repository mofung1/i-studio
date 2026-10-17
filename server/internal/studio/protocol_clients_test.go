package studio

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPromptProtocolCompletion(t *testing.T) {
	for _, test := range []struct{ name, response, text, kind string }{
		{"string", `{"choices":[{"message":{"content":"完整提示词"},"finish_reason":"stop"}]}`, "完整提示词", ""},
		{"blocks", `{"choices":[{"message":{"content":[{"type":"text","text":"商品"},{"type":"text","text":"摄影"}]},"finish_reason":"stop"}]}`, "商品摄影", ""},
		{"truncation", `{"choices":[{"message":{"content":"未完成"},"finish_reason":"length"}]}`, "", "length"},
		{"thinking-exhausted", `{"choices":[{"message":{"content":null,"reasoning_content":"思考"},"finish_reason":"length"}]}`, "", "length"},
		{"filtered", `{"choices":[{"message":{"content":null},"finish_reason":"content_filter"}]}`, "", "filter"},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				thinking, _ := body["thinking"].(map[string]any)
				messages, _ := body["messages"].([]any)
				user, _ := messages[1].(map[string]any)
				if user["content"] != "产品摄影" {
					t.Errorf("text-only content must be a string, got %#v", user["content"])
				}
				if r.URL.Path != "/v1/chat/completions" || body["max_tokens"] != float64(4096) || thinking["type"] != "disabled" {
					t.Errorf("incorrect completion request: %#v", body)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(test.response))
			}))
			defer server.Close()
			client := &openAICompatibleClient{baseURL: server.URL + "/v1", apiKey: "test", model: "deepseek-flash", client: server.Client(), disableThinking: true}
			text, err := client.complete(context.Background(), "重写提示词", "产品摄影", nil, 4096)
			if text != test.text {
				t.Fatalf("unexpected text %q", text)
			}
			if test.kind == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			var upstream *promptUpstreamError
			if !errors.As(err, &upstream) || upstream.kind != test.kind {
				t.Fatalf("expected %s, got %v", test.kind, err)
			}
		})
	}
}

func TestPromptProtocolTimeout(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	defer func() { close(release); server.Close() }()
	client := &openAICompatibleClient{baseURL: server.URL, model: "test", client: protocolHTTPClient(25 * time.Millisecond)}
	_, err := client.complete(context.Background(), "重写", "商品", nil, 4096)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("timeout category was lost: %v", err)
	}
}

func TestPromptProtocolImageContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		var parts []struct {
			Type     string `json:"type"`
			ImageURL struct {
				URL string `json:"url"`
			} `json:"image_url"`
		}
		if err := json.Unmarshal(body.Messages[1].Content, &parts); err != nil {
			t.Error(err)
		}
		if len(parts) != 2 || parts[0].Type != "text" || parts[1].Type != "image_url" || parts[1].ImageURL.URL != "data:image/png;base64,aGVsbG8=" {
			t.Errorf("invalid multimodal input: %#v", parts)
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"改写结果"},"finish_reason":"stop"}]}`))
	}))
	defer server.Close()
	client := &openAICompatibleClient{baseURL: server.URL, model: "vision", client: server.Client()}
	_, err := client.complete(context.Background(), "重写", "产品摄影", []promptImage{{Mime: "image/png", Data: "aGVsbG8="}}, 4096)
	if err != nil {
		t.Fatal(err)
	}
}
