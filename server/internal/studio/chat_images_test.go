package studio

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestChatImageRequestAndMultimodalResponses(t *testing.T) {
	for _, body := range []string{
		`{"choices":[{"message":{"images":[{"type":"image_url","image_url":{"url":"data:image/webp;base64,aW1hZ2U="}}]}}]}`,
		`{"choices":[{"message":{"content":[{"type":"image_url","image_url":"https://images.example/a.png"}]}}]}`,
		`{"choices":[{"message":{"images":[{"b64_json":"aW1hZ2U=","mime_type":"image/jpeg"}]}}]}`,
	} {
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer fixture-key" {
				t.Error("invalid chat request")
			}
			var input map[string]any
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Error(err)
			}
			parts := input["messages"].([]any)[0].(map[string]any)["content"].([]any)
			if input["model"] != "configured-upstream" || len(parts) != 2 || parts[1].(map[string]any)["image_url"].(map[string]any)["url"] != "data:image/png;base64,aW1hZ2U=" {
				t.Error("incorrect multimodal request", input)
			}
			if input["image_config"].(map[string]any)["aspect_ratio"] != "3:4" || input["image_config"].(map[string]any)["image_size"] != "2K" {
				t.Error("parameters silently discarded")
			}
			fmt.Fprint(w, body)
		}))
		client := newImageProtocolClient(endpointConfig{Protocol: "openai_chat", BaseURL: upstream.URL + "/api/v1", Model: "configured-upstream", TimeoutSeconds: 3}, "fixture-key").(*imageProtocolTransport)
		client.client = upstream.Client()
		result, err := client.Submit(context.Background(), map[string]any{"prompt": "draw", "aspectRatio": "3:4", "resolution": "2K", "sourceImages": []map[string]string{{"mime": "image/png", "data": "aW1hZ2U="}}})
		upstream.Close()
		if err != nil || len(result.Images) != 1 {
			t.Fatal(result, err)
		}
	}
}
func TestImageProtocolsRejectUnsupportedAndUpstreamErrors(t *testing.T) {
	for _, protocol := range []string{"openai_images", "gemini_native", "openai_chat"} {
		for _, body := range []string{`{"error":{"message":"invalid fixture-key"}}`, `{"choices":[{"message":{"content":"text only"}}]}`, `{"taskID":"remote-id"}`, `{"promptFeedback":{"blockReason":"SAFETY"}}`} {
			client := &imageProtocolTransport{model: "configured", protocol: protocol, apiKey: "fixture-key", baseURL: "https://mock.example", client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) { return jsonResponse(r, body), nil })}}
			_, err := client.Submit(context.Background(), map[string]any{"prompt": "draw"})
			if err == nil || strings.Contains(err.Error(), "fixture-key") {
				t.Fatal("unsupported/error response accepted or secret leaked", err)
			}
		}
	}
	for _, input := range []map[string]any{{"resolution": "8K"}, {"aspectRatio": "5:7"}, {"resolution": "auto"}} {
		if err := validateImageProtocolParameters("gemini_native", input); err == nil {
			t.Fatal("unsupported parameter accepted")
		}
	}
}
func TestChannelSSRFValidationAndDial(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1/v1", "http://[::1]/v1", "http://10.0.0.1", "http://169.254.169.254", "https://localhost", "https://internal.local", "https://user:secret@example.com", "https://example.com?key=secret", "ftp://example.com"} {
		input := testEndpointInput("image", "openai_images")
		input.BaseURL = raw
		if err := validateEndpoint(&input); err == nil {
			t.Fatal("unsafe URL accepted", raw)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if conn, err := dialPublicImage(ctx, "tcp", "127.0.0.1:80"); err == nil {
		conn.Close()
		t.Fatal("private address dialled")
	}
	client := protocolHTTPClient(time.Second)
	if client.Transport.(*http.Transport).Proxy != nil || client.CheckRedirect(nil, nil) != http.ErrUseLastResponse {
		t.Fatal("proxy or redirect bypass")
	}
}
func TestModelCapabilityValidation(t *testing.T) {
	caps := modelCapabilities{AspectRatios: []string{"1:1"}, Resolutions: []string{"1K"}}
	for _, input := range []map[string]any{{"aspectRatio": "1:1", "resolution": "4K"}, {"aspectRatio": "3:4", "resolution": "1K"}, {"aspectRatio": "1:1", "resolution": "1K", "productAssetIds": []any{"asset"}}} {
		if err := validateModelParameters(caps, input); err == nil {
			t.Fatal("unsupported model parameter accepted")
		}
	}
}
