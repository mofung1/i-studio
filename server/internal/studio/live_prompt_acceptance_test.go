package studio

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

// Opt-in only. Business configuration is read-only; user and usage writes are
// isolated. This transport permits five prompt calls and blocks image generation.
func TestLivePromptFiveEntries(t *testing.T) {
	if os.Getenv("ISTUDIO_LIVE_PROMPT_AUTHORIZATION") != "five-prompt-entries" {
		t.Skip("live prompt test not authorized")
	}
	root, output := os.Getenv("ISTUDIO_LIVE_PROJECT_ROOT"), os.Getenv("ISTUDIO_LIVE_OUTPUT")
	if !filepath.IsAbs(root) || !filepath.IsAbs(output) {
		t.Fatal("absolute project and output paths required")
	}
	s, _, _ := operationTestServer(t)
	u, err := url.Parse(os.Getenv("ISTUDIO_LIVE_SOURCE_DATABASE_URL"))
	if err != nil || u.Hostname() != "127.0.0.1" {
		t.Fatal("local source database required")
	}
	query := u.Query()
	query.Set("default_transaction_read_only", "on")
	u.RawQuery = query.Encode()
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal("source database unavailable")
	}
	defer db.Close()
	source := &Service{db: db, storageRoot: filepath.Join(root, "server/storage/uploads")}
	source.ai = newAIConfigStore(source)
	endpoint, err := source.ai.resolve("prompt", "", "")
	if err != nil {
		t.Fatal("no usable configured prompt endpoint")
	}
	address, err := url.Parse(endpoint.BaseURL)
	if err != nil || address.Scheme != "https" {
		t.Fatal("configured prompt endpoint must use HTTPS")
	}
	sourceKey := ""
	env, _ := os.ReadFile(filepath.Join(root, "server/.env"))
	for _, line := range strings.Split(string(env), "\n") {
		pair := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(pair) == 2 && pair[0] == "AI_CONFIG_ENCRYPTION_KEY" {
			sourceKey = strings.Trim(pair[1], "\"'")
		}
	}
	if sourceKey == "" {
		key, err := os.ReadFile(filepath.Join(source.storageRoot, ".ai/encryption.key"))
		if err != nil || len(key) != 32 {
			t.Fatal("source encryption key unavailable")
		}
		sourceKey = base64.StdEncoding.EncodeToString(key)
	}
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", sourceKey)
	key, err := source.ai.decrypt(endpoint)
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", "")
	if err != nil {
		t.Fatal("cannot decrypt configured prompt endpoint")
	}
	_, err = s.ai.save("", endpointInput{Name: "Prompt acceptance", Purpose: "prompt", Protocol: endpoint.Protocol, BaseURL: endpoint.BaseURL, APIKey: key, Model: endpoint.Model, TimeoutSeconds: endpoint.TimeoutSeconds, Capabilities: endpoint.Capabilities, Enabled: true, IsDefault: true})
	if err != nil {
		t.Fatal("cannot prepare isolated prompt endpoint")
	}
	var templates []promptTemplate
	if err = source.ai.withConfig(false, func(c *aiConfiguration) error { templates = c.Templates; return nil }); err != nil {
		t.Fatal("cannot read prompt templates")
	}
	if err = s.ai.withConfig(true, func(c *aiConfiguration) error { c.Templates = templates; return nil }); err != nil {
		t.Fatal("cannot copy prompt templates")
	}
	client := protocolHTTPClient(time.Duration(endpoint.TimeoutSeconds) * time.Second)
	var calls atomic.Int32
	client.Transport = promptAcceptanceTransport{base: client.Transport, host: address.Host, scheme: address.Scheme, calls: &calls}
	s.aiHTTPClient = client
	s.promptClient = &dynamicPromptClient{server: s}
	s.storage = objectstore.NewLocal(s.storageRoot)
	token := s.testToken(domain.User{ID: "member"})
	product := filepath.Join(root, "web/public/images/marketing/commerce-2026-10-22/skincare-base.webp")
	reference := filepath.Join(root, "web/public/images/marketing/ecommerce/amber-perfume.webp")
	type sample struct {
		Kind      string `json:"kind"`
		Input     string `json:"input"`
		Text      string `json:"text"`
		Model     string `json:"model"`
		Status    int    `json:"status"`
		ElapsedMS int64  `json:"elapsedMs"`
		Changed   bool   `json:"changed"`
	}
	results := []sample{}
	for _, kind := range []string{"general", "product-main", "detail-page", "viral-recreate", "product-retouch"} {
		if filter := os.Getenv("ISTUDIO_LIVE_PROMPT_TASKS"); filter != "" && !strings.Contains(","+filter+",", ","+kind+",") {
			continue
		}
		text := "象牙白护肤罐和包装盒，深绿色盖子，柔和自然光，保留商品外形与包装文字，不新增文字。"
		fields := map[string][]string{"target": {"requirements"}, "text": {text}, "taskType": {kind}, "platform": {"smart"}, "outputLanguage": {"none"}}
		switch kind {
		case "general":
			fields["target"] = []string{"prompt"}
			fields["style"] = []string{"minimal"}
			delete(fields, "taskType")
		case "product-main":
			fields["moduleMode"] = []string{"custom"}
			fields["modules"] = []string{"白底主图×1"}
			fields["moduleKeys"] = []string{"white×1"}
		case "detail-page":
			fields["moduleMode"] = []string{"custom"}
			fields["modules"] = []string{"首屏主视觉×1", "产品细节图×1"}
			fields["moduleKeys"] = []string{"hero×1", "detail×1"}
		case "viral-recreate":
			fields["recreateStrength"] = []string{"high"}
		case "product-retouch":
			text = "只修复商品图中的划痕与瑕疵，保留原背景、机位、配色、产品形状和包装文字，不新增道具或文字。"
			fields["text"] = []string{text}
			fields["enhancements"] = []string{"repair"}
		}
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		for name, values := range fields {
			for _, value := range values {
				if err := writer.WriteField(name, value); err != nil {
					t.Fatal(err)
				}
			}
		}
		if endpoint.Capabilities["vision"] {
			files := []string{product}
			if kind == "viral-recreate" {
				files = append(files, reference)
			}
			for _, path := range files {
				data, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				part, err := writer.CreateFormFile("images", filepath.Base(path))
				if err != nil {
					t.Fatal(err)
				}
				if _, err = part.Write(data); err != nil {
					t.Fatal(err)
				}
			}
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest("POST", "/v1/prompts/enhance", body)
		r.Header.Set("Content-Type", writer.FormDataContentType())
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		start := time.Now()
		s.promptEnhance(w, r)
		var payload struct {
			Text  string `json:"text"`
			Model string `json:"model"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &payload)
		results = append(results, sample{kind, text, payload.Text, payload.Model, w.Code, time.Since(start).Milliseconds(), strings.TrimSpace(payload.Text) != text && payload.Text != ""})
		t.Logf("%s HTTP %d, chars=%d, elapsed=%dms", kind, w.Code, len([]rune(payload.Text)), time.Since(start).Milliseconds())
	}
	if err := os.MkdirAll(output, 0700); err != nil {
		t.Fatal(err)
	}
	raw, err := json.MarshalIndent(map[string]any{"model": endpoint.Model, "vision": endpoint.Capabilities["vision"], "providerCalls": calls.Load(), "samples": results, "cost": "provider billing not supplied"}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(output, "prompt-five-entries.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	for _, sample := range results {
		if sample.Status != 200 || !sample.Changed {
			t.Errorf("%s did not return a changed prompt (HTTP %d)", sample.Kind, sample.Status)
		}
	}
}

type promptAcceptanceTransport struct {
	base         http.RoundTripper
	host, scheme string
	calls        *atomic.Int32
}

func (p promptAcceptanceTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	path := r.URL.Path
	if r.Method != "POST" || r.URL.Host != p.host || r.URL.Scheme != p.scheme || (!strings.HasSuffix(path, "/chat/completions") && !strings.Contains(path, ":generateContent") && !strings.HasSuffix(path, "/messages")) {
		return nil, errors.New("live prompt transport blocked an unrelated request")
	}
	if p.calls.Add(1) > 5 {
		return nil, errors.New("live prompt request limit reached")
	}
	if p.base == nil {
		p.base = http.DefaultTransport
	}
	response, err := p.base.RoundTrip(r)
	if err != nil {
		return nil, errors.New("live prompt upstream connection failed")
	}
	// Responses are handled by the normal protocol parser; no headers or keys are logged.
	return response, nil
}
