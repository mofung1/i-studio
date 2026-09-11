package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func signPayload(payload string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestBananaRouterGeminiSubmit(t *testing.T) {
	imageData := base64.StdEncoding.EncodeToString([]byte("image"))
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(request.URL.Path, ":generateContent") {
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
		if request.Header.Get("x-goog-api-key") != "test-key" {
			t.Fatal("missing Gemini API key header")
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"` + imageData + `"}}]}}]}`)),
			Request:    request,
		}, nil
	})}

	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	result, err := provider.Submit(context.Background(), map[string]any{
		"model": "gemini-3.1-flash-image", "prompt": "product photo", "sourceImages": []map[string]string{{"mime": "image/png", "data": imageData}},
	})
	if err != nil {
		t.Fatalf("Submit() error = %v", err)
	}
	if len(result.Images) != 1 || !strings.HasPrefix(result.Images[0], "data:image/png;base64,") {
		t.Fatalf("unexpected images %#v", result.Images)
	}
}

func TestBananaRouterOpenAIGenerationSubmit(t *testing.T) {
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/v1/images/generations/async" {
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatal("missing OpenAI-compatible authorization header")
		}
		if request.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("unexpected content type %q", request.Header.Get("Content-Type"))
		}
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if body["model"] != "gpt-image-2" || body["prompt"] != "product photo" {
			t.Fatalf("unexpected request body %#v", body)
		}
		if body["size"] != "1024x1024" {
			t.Fatalf("unexpected size %#v", body["size"])
		}
		return jsonResponse(request, `{"taskID":"generation-task","status":"pending"}`), nil
	})}

	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	result, err := provider.Submit(context.Background(), map[string]any{
		"model": "gpt-image-2", "prompt": "product photo", "aspectRatio": "1:1", "resolution": "1K",
	})
	if err != nil {
		t.Fatalf("Submit() error = %v", err)
	}
	if result.ID != "generation-task" || result.Status != "pending" || len(result.Images) != 0 {
		t.Fatalf("unexpected result %#v", result)
	}
}

func TestBananaRouterOpenAIEditSubmit(t *testing.T) {
	sourceData := []byte("source-image")
	secondSourceData := []byte("second-source-image")
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/v1/images/edits/async" {
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
		if !strings.HasPrefix(request.Header.Get("Content-Type"), "multipart/form-data; boundary=") {
			t.Fatalf("unexpected content type %q", request.Header.Get("Content-Type"))
		}
		if err := request.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart request: %v", err)
		}
		for name, expected := range map[string]string{
			"model": "gpt-image-2", "prompt": "edit product photo", "n": "1", "size": "2048x2048",
		} {
			if actual := request.FormValue(name); actual != expected {
				t.Fatalf("unexpected %s field %q", name, actual)
			}
		}
		files := request.MultipartForm.File["image"]
		if len(files) != 2 || files[0].Filename != "source-1.png" || files[1].Filename != "source-2.jpg" {
			t.Fatalf("unexpected image parts %#v", files)
		}
		if files[0].Header.Get("Content-Type") != "image/png" {
			t.Fatalf("unexpected image content type %q", files[0].Header.Get("Content-Type"))
		}
		file, err := files[0].Open()
		if err != nil {
			t.Fatalf("open multipart image: %v", err)
		}
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil || string(data) != string(sourceData) {
			t.Fatalf("unexpected multipart image %q, %v", data, err)
		}
		return jsonResponse(request, `{"task_id":"edit-task","status":"queued"}`), nil
	})}

	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	result, err := provider.Submit(context.Background(), map[string]any{
		"model": "gpt-image-2", "prompt": "edit product photo", "aspectRatio": "1:1", "resolution": "2K",
		"sourceImages": []map[string]string{
			{"mime": "image/png", "data": base64.StdEncoding.EncodeToString(sourceData)},
			{"mime": "image/jpeg", "data": base64.StdEncoding.EncodeToString(secondSourceData)},
		},
	})
	if err != nil {
		t.Fatalf("Submit() error = %v", err)
	}
	if result.ID != "edit-task" || result.Status != "queued" || len(result.Images) != 0 {
		t.Fatalf("unexpected result %#v", result)
	}
}

func TestBananaRouterPoll(t *testing.T) {
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/v1/async-tasks/provider-task" {
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
		return jsonResponse(request, `{"status":"success","resultImages":[{"url":"https://images.example/result.png"}]}`), nil
	})}
	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	result, err := provider.Poll(context.Background(), "provider-task")
	if err != nil {
		t.Fatalf("Poll() error = %v", err)
	}
	if result.Status != "success" || len(result.Images) != 1 || result.Images[0] != "https://images.example/result.png" {
		t.Fatalf("unexpected poll result %#v", result)
	}
}

func TestBananaRouterSubmitPreservesProviderError(t *testing.T) {
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusBadGateway,
			Status:     "502 Bad Gateway",
			Body:       io.NopCloser(strings.NewReader("upstream model unavailable")),
			Request:    request,
		}, nil
	})}
	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	_, err := provider.Submit(context.Background(), map[string]any{"model": "gpt-image-2", "prompt": "product photo"})
	if err == nil || !strings.Contains(err.Error(), "upstream model unavailable") {
		t.Fatalf("unexpected error %v", err)
	}
}

func TestBananaRouterPollReadsNestedError(t *testing.T) {
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(request, `{"status":"failed","error":{"message":"reference image rejected"}}`), nil
	})}
	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	result, err := provider.Poll(context.Background(), "provider-task")
	if err != nil {
		t.Fatalf("Poll() error = %v", err)
	}
	if result.Status != "failed" || result.Error != "reference image rejected" {
		t.Fatalf("unexpected poll result %#v", result)
	}
}

func TestBananaRouterPollReadsStringError(t *testing.T) {
	client := &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(request, `{"status":"failed","error":"model rejected image dimensions"}`), nil
	})}
	provider := &bananaRouterProvider{baseURL: "https://provider.example", apiKey: "test-key", client: client}
	result, err := provider.Poll(context.Background(), "provider-task")
	if err != nil {
		t.Fatalf("Poll() error = %v", err)
	}
	if result.Error != "model rejected image dimensions" {
		t.Fatalf("unexpected poll result %#v", result)
	}
}

func jsonResponse(request *http.Request, body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
		Request:    request,
	}
}

func TestReadGeneratedDataImage(t *testing.T) {
	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	source := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	data, mime, err := readGeneratedImage(http.DefaultClient, source)
	if err != nil || len(data) == 0 || mime != "image/png" {
		t.Fatalf("readGeneratedImage() = %q, %q, %v", data, mime, err)
	}
}
