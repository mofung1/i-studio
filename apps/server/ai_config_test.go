package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func testAIStore(t *testing.T) *server {
	t.Helper()
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	t.Setenv("BANANA_ROUTER_API_KEY", "")
	s := &server{secret: []byte("test-secret"), storageRoot: filepath.Join(t.TempDir(), "uploads"), users: map[string]user{}, aiAdminID: "admin"}
	s.ai = newAIConfigStore(s)
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	return s
}
func testEndpointInput(purpose, protocol string) endpointInput {
	return endpointInput{Name: "Test endpoint", Purpose: purpose, Protocol: protocol, BaseURL: "https://endpoint.example/v1", APIKey: "sk-private-test-abcd", Model: "custom/future-model", TimeoutSeconds: 60, Capabilities: map[string]bool{}, Enabled: true}
}
func TestAIEncryptionDefaultAndPersistence(t *testing.T) {
	s := testAIStore(t)
	input := testEndpointInput("image", "openai_image")
	first, err := s.ai.save("", input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.ai.save("", input)
	if err != nil {
		t.Fatal(err)
	}
	if first.APIKeyEncrypted == second.APIKeyEncrypted {
		t.Fatal("expected random nonces")
	}
	if !first.IsDefault || second.IsDefault {
		t.Fatal("expected exactly one default")
	}
	public, err := s.ai.public(first)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(public)
	if strings.Contains(string(raw), input.APIKey) || strings.Contains(string(raw), "apiKeyEncrypted") || strings.Contains(string(raw), "\"apiKey\"") {
		t.Fatal("key leaked")
	}
	if public["apiKeyMasked"] != "****abcd" {
		t.Fatal("unexpected mask")
	}
	disk, err := os.ReadFile(s.ai.configPath())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(disk, []byte(input.APIKey)) {
		t.Fatal("key stored in plaintext")
	}
	keyFile, err := os.Stat(filepath.Join(s.storageRoot, ".ai", "encryption.key"))
	if err != nil {
		t.Fatal(err)
	}
	if keyFile.Mode().Perm() != 0600 {
		t.Fatal("key permissions")
	}
	restored := newAIConfigStore(s)
	e, err := restored.resolve("image", "", "")
	if err != nil || e.ID != first.ID {
		t.Fatal("configuration not persisted", err)
	}
	if err := s.ai.mutate(first.ID, true); err != nil {
		t.Fatal(err)
	}
	e, err = s.ai.resolve("image", "", "")
	if err != nil || e.ID != second.ID {
		t.Fatal("default was not replaced", err)
	}
	tampered := second
	tampered.ID = "another-id"
	if _, err := s.ai.decrypt(tampered); err == nil {
		t.Fatal("ciphertext not bound to endpoint id")
	}
}
func TestAIConcurrentDefaultSelection(t *testing.T) {
	s := testAIStore(t)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			input := testEndpointInput("prompt", "openai_chat")
			input.IsDefault = true
			if _, err := s.ai.save("", input); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	endpoints, err := s.ai.list()
	if err != nil {
		t.Fatal(err)
	}
	defaults := 0
	for _, e := range endpoints {
		if e.IsDefault {
			defaults++
		}
	}
	if defaults != 1 {
		t.Fatalf("defaults=%d", defaults)
	}
}
func TestLegacyAIImportIsIdempotentAndKeepsTemplates(t *testing.T) {
	s := testAIStore(t)
	t.Setenv("DEEPSEEK_API_KEY", "legacy-prompt-key")
	t.Setenv("BANANA_ROUTER_API_KEY", "legacy-image-key")
	t.Setenv("AI_PROVIDER_ENABLED", "true")
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	endpoints, err := s.ai.list()
	if err != nil || len(endpoints) != 5 {
		t.Fatalf("endpoints=%d err=%v", len(endpoints), err)
	}
	if err := s.ai.withConfig(true, func(state *aiConfiguration) error { state.Templates[0].Content = "User edited template"; return nil }); err != nil {
		t.Fatal(err)
	}
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	endpoints, _ = s.ai.list()
	if len(endpoints) != 5 {
		t.Fatal("duplicated import")
	}
	if err := s.ai.withConfig(false, func(state *aiConfiguration) error {
		if state.Templates[0].Content != "User edited template" {
			t.Fatal("custom content overwritten")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, e := range endpoints {
		if e.Purpose == "image" && e.IsDefault && (e.Protocol != "openai_image" || e.Model != "gpt-image-2" || !e.Capabilities["async"]) {
			t.Fatal("old default not preserved")
		}
	}
	for _, e := range endpoints {
		if err := s.ai.mutate(e.ID, true); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	endpoints, _ = s.ai.list()
	if len(endpoints) != 0 {
		t.Fatal("deleted endpoints reimported")
	}
}
func TestAISettingsAuthorizationAndRestoreDefault(t *testing.T) {
	s := testAIStore(t)
	input := testEndpointInput("prompt", "openai_chat")
	if _, err := s.ai.save("", input); err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body, uid string) *http.Request {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if uid != "" {
			r.Header.Set("Authorization", "Bearer "+s.token(user{ID: uid}))
		}
		return r
	}
	for _, test := range []struct {
		uid    string
		status int
	}{{"", 401}, {"other", 403}} {
		w := httptest.NewRecorder()
		s.aiEndpoints(w, request("POST", "/v1/ai-endpoints", "{}", test.uid))
		if w.Code != test.status {
			t.Fatalf("status %d", w.Code)
		}
	}
	w := httptest.NewRecorder()
	s.aiEndpoints(w, request("GET", "/v1/ai-endpoints", "", "other"))
	if strings.Contains(w.Body.String(), "baseUrl") || strings.Contains(w.Body.String(), "apiKey") {
		t.Fatal("ordinary user received private settings")
	}
	w = httptest.NewRecorder()
	s.promptTemplates(w, request("PUT", "/v1/prompt-templates", `{"key":"rewrite","content":"Custom system","enabled":true}`, "admin"))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	r := newPromptRequest(t, "", "user text", 0)
	_ = r.ParseMultipartForm(maxPromptBodySize)
	system, _, err := s.buildPrompt("prompt", "user text", r)
	if err != nil || system != "Custom system" {
		t.Fatal("builder did not use saved template")
	}
	w = httptest.NewRecorder()
	s.promptTemplates(w, request("PUT", "/v1/prompt-templates", `{"key":"rewrite","restoreDefault":true}`, "admin"))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	system, _, err = s.buildPrompt("prompt", "user text", r)
	if err != nil || system != promptRewriteSystemPrompt {
		t.Fatal("restore did not use default")
	}
}
func TestPromptVisionGuardBlocksImagesBeforeClient(t *testing.T) {
	s := testAIStore(t)
	if _, err := s.ai.save("", testEndpointInput("prompt", "openai_chat")); err != nil {
		t.Fatal(err)
	}
	client := &fakePromptClient{reply: "result"}
	s.promptClient = client
	w := httptest.NewRecorder()
	s.promptEnhance(w, newPromptRequest(t, s.token(user{ID: "admin"}), "image description", 1))
	if w.Code != 400 || !strings.Contains(w.Body.String(), "PROMPT_VISION_UNSUPPORTED") || client.images != 0 {
		t.Fatal("non-vision endpoint accepted images")
	}
}
func TestProtocolClientsUseConfiguredProtocolModelAndStandardPaths(t *testing.T) {
	for _, protocol := range []string{"openai_chat", "openai_image", "gemini_generate_content"} {
		t.Run(protocol, func(t *testing.T) {
			var path string
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				path = r.URL.Path
				if protocol == "gemini_generate_content" {
					if r.Header.Get("x-goog-api-key") != "secret" {
						t.Error("missing Gemini auth")
					}
					io.WriteString(w, `{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"aW1hZ2U="}}]}}]}`)
				} else {
					if r.Header.Get("Authorization") != "Bearer secret" {
						t.Error("missing OpenAI auth")
					}
					if strings.Contains(path, "edits") {
						if err := r.ParseMultipartForm(1 << 20); err != nil {
							t.Error(err)
						}
						if r.FormValue("model") != "future-model" {
							t.Error("model overwritten")
						}
					} else {
						var body map[string]any
						_ = json.NewDecoder(r.Body).Decode(&body)
						if body["model"] != "future-model" {
							t.Error("model overwritten")
						}
						if body["thinking"] != nil {
							t.Error("vendor-specific field leaked into compatible request")
						}
					}
					if protocol == "openai_chat" {
						io.WriteString(w, `{"choices":[{"message":{"content":"OK"}}]}`)
					} else {
						io.WriteString(w, `{"data":[{"b64_json":"aW1hZ2U="}]}`)
					}
				}
			}))
			defer upstream.Close()
			e := endpointConfig{Protocol: protocol, BaseURL: upstream.URL + "/v1", Model: "future-model", TimeoutSeconds: 3}
			if protocol == "gemini_generate_content" {
				e.BaseURL = upstream.URL + "/v1beta"
			}
			if protocol == "openai_chat" {
				result, err := newOpenAICompatibleClient(e, "secret").complete(context.Background(), "system", "text", nil, 8)
				if err != nil || result != "OK" || path != "/v1/chat/completions" {
					t.Fatal(result, err, path)
				}
			} else {
				client := newImageProtocolClient(e, "secret")
				_, err := client.Submit(context.Background(), map[string]any{"prompt": "prompt", "model": "ignored"})
				if err != nil {
					t.Fatal(err)
				}
				expected := "/v1/images/generations"
				if protocol == "gemini_generate_content" {
					expected = "/v1beta/models/future-model:generateContent"
				}
				if path != expected {
					t.Fatal(path)
				}
				if protocol == "openai_image" {
					_, err = client.Submit(context.Background(), map[string]any{"prompt": "edit", "sourceImages": []map[string]string{{"mime": "image/png", "data": "aW1hZ2U="}}})
					if err != nil || path != "/v1/images/edits" {
						t.Fatal(err, path)
					}
				}
			}
		})
	}
}
func TestAIConnectionTestCallsActualProtocolAndRedactsErrors(t *testing.T) {
	s := testAIStore(t)
	count := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		if r.URL.Path != "/v1/chat/completions" {
			t.Error(r.URL.Path)
		}
		w.WriteHeader(401)
		io.WriteString(w, `{"error":{"message":"API Key invalid: sk-private-test-abcd"}}`)
	}))
	defer upstream.Close()
	input := testEndpointInput("prompt", "openai_chat")
	input.BaseURL = upstream.URL + "/v1"
	e, err := s.ai.save("", input)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("POST", "/v1/ai-endpoints/"+e.ID+"/test", nil)
	r.Header.Set("Authorization", "Bearer "+s.token(user{ID: "admin"}))
	w := httptest.NewRecorder()
	s.aiEndpointByID(w, r)
	if count != 1 || !strings.Contains(w.Body.String(), "401") || strings.Contains(w.Body.String(), input.APIKey) || !strings.Contains(w.Body.String(), "\"success\":false") {
		t.Fatal(w.Body.String())
	}
}

func TestAISettingsCORSAllowsWrites(t *testing.T) {
	t.Setenv("WEB_ORIGINS", "http://127.0.0.1:3100")
	req := httptest.NewRequest(http.MethodOptions, "/v1/prompt-templates", nil)
	req.Header.Set("Origin", "http://127.0.0.1:3100")
	req.Header.Set("Access-Control-Request-Method", "PUT")
	response := httptest.NewRecorder()
	cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})).ServeHTTP(response, req)
	if !strings.Contains(response.Header().Get("Access-Control-Allow-Methods"), "PUT") || !strings.Contains(response.Header().Get("Access-Control-Allow-Methods"), "DELETE") {
		t.Fatal("configuration write methods not allowed by CORS")
	}
}

func TestProtocolClientDoesNotForwardKeysThroughRedirects(t *testing.T) {
	followed := false
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { followed = true }))
	defer destination.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL, http.StatusTemporaryRedirect)
	}))
	defer origin.Close()
	request, _ := http.NewRequest(http.MethodGet, origin.URL, nil)
	request.Header.Set("x-goog-api-key", "sensitive")
	response, err := protocolHTTPClient(time.Second).Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if followed || response.StatusCode != http.StatusTemporaryRedirect {
		t.Fatal("AI authentication forwarded via redirect")
	}
}
