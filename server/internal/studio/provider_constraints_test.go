package studio

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestOpenAI4KRequestsRespectSizeLimits(t *testing.T) {
	for _, ratio := range []string{"1:1", "2:3", "3:4", "4:3", "9:16", "16:9"} {
		for _, edit := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/edit=%t", ratio, edit), func(t *testing.T) {
				client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
					var size string
					if edit {
						if err := request.ParseMultipartForm(1 << 20); err != nil {
							t.Fatal(err)
						}
						defer request.MultipartForm.RemoveAll()
						size = request.FormValue("size")
					} else {
						var body struct {
							Size string `json:"size"`
						}
						if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
							t.Fatal(err)
						}
						size = body.Size
					}
					var width, height, ratioWidth, ratioHeight int
					if _, err := fmt.Sscanf(size, "%dx%d", &width, &height); err != nil {
						t.Fatalf("invalid size %q: %v", size, err)
					}
					if _, err := fmt.Sscanf(ratio, "%d:%d", &ratioWidth, &ratioHeight); err != nil {
						t.Fatal(err)
					}
					if width <= 0 || height <= 0 || width > 3840 || height > 3840 || width%16 != 0 || height%16 != 0 || width*height < 655360 || width*height > 8294400 {
						t.Fatalf("4K %s request exceeds OpenAI size constraints: %s", ratio, size)
					}
					if width*ratioHeight != height*ratioWidth {
						t.Fatalf("4K request changed aspect ratio %s to %s", ratio, size)
					}
					// Ratios are reduced. The next exact size with both edges on the
					// 16-pixel grid must exceed an edge or pixel limit.
					nextWidth, nextHeight := width+16*ratioWidth, height+16*ratioHeight
					if nextWidth <= 3840 && nextHeight <= 3840 && nextWidth*nextHeight <= 8294400 {
						t.Fatalf("4K %s unnecessarily reduced output size to %s", ratio, size)
					}
					return jsonResponse(request, `{"taskID":"4k-task","status":"queued"}`), nil
				})}
				provider := &imageProtocolTransport{baseURL: "https://provider.example", client: client}
				input := map[string]any{"model": "gpt-image-2", "prompt": "product photo", "aspectRatio": ratio, "resolution": "4K"}
				if edit {
					input["sourceImages"] = []map[string]string{{"mime": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("source-image"))}}
				}
				if _, err := provider.Submit(context.Background(), input); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}

func TestImageProtocolPollStatusMessage(t *testing.T) {
	for _, test := range []struct {
		name, body, want string
	}{
		{"failed", `{"status":"failed","statusMessage":"image dimensions exceed maximum"}`, "image dimensions exceed maximum"},
		{"cancelled", `{"status":"cancelled","statusMessage":"cancelled by provider"}`, "cancelled by provider"},
		{"expired", `{"status":"expired","statusMessage":"request expired before execution"}`, "request expired before execution"},
		{"generic message", `{"status":"failed","message":"failed","statusMessage":"upstream timeout"}`, "upstream timeout"},
		{"explicit error", `{"status":"failed","statusMessage":"failed","errorMessage":"reference image rejected"}`, "reference image rejected"},
		{"nested error", `{"status":"failed","statusMessage":"failed","error":{"message":"quota exceeded"}}`, "quota exceeded"},
		{"redacted key", `{"status":"failed","statusMessage":"rejected test-key"}`, "rejected [redacted]"},
		{"success", `{"status":"success","statusMessage":"ok","resultImages":[{"url":"https://images.example/result.png"}]}`, ""},
		{"running", `{"status":"running","statusMessage":"generation in progress"}`, ""},
		{"retry", `{"status":"retry","statusMessage":"temporary upstream error, retrying"}`, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			provider := &imageProtocolTransport{baseURL: "https://provider.example", apiKey: "test-key", client: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
				return jsonResponse(request, test.body), nil
			})}}
			result, err := provider.Poll(context.Background(), "provider-task")
			if err != nil || result.Error != test.want {
				t.Fatalf("Poll() error = %v, reason = %q; want %q", err, result.Error, test.want)
			}
		})
	}
}

func TestImageProtocolPollHTTPErrorReadsStatusMessage(t *testing.T) {
	provider := &imageProtocolTransport{baseURL: "https://provider.example", apiKey: "test-key", client: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		response := jsonResponse(request, `{"statusMessage":"upstream timeout for test-key"}`)
		response.StatusCode, response.Status = http.StatusBadGateway, "502 Bad Gateway"
		return response, nil
	})}}
	_, err := provider.Poll(context.Background(), "provider-task")
	if err == nil || !strings.Contains(err.Error(), "upstream timeout for [redacted]") || strings.Contains(err.Error(), "statusMessage") || strings.Contains(err.Error(), "test-key") {
		t.Fatalf("unexpected HTTP error: %v", err)
	}
}

func TestProviderPollingPreservesStatusMessageFailure(t *testing.T) {
	provider := &imageProtocolTransport{baseURL: "https://provider.example", client: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(request, `{"status":"failed","statusMessage":"upstream timeout"}`), nil
	})}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := pollProviderImages(ctx, "local-task", "provider-task", provider, time.Nanosecond)
	if err == nil || err.Error() != "upstream timeout" {
		t.Fatalf("lost provider failure: %v", err)
	}
	if publicGenerationError(err.Error()) != "生成服务处理超时，请稍后重试；已完成的图片会保留。" {
		t.Fatal("statusMessage did not reach public error classification")
	}
}
