package studio

import (
	"bytes"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
)

func validReverseResult() reverseResult {
	return reverseResult{PromptZh: "暖色背景中的透明玻璃瓶，自然侧光，主体完整居中。", PromptEn: "A clear glass bottle on a warm background, with natural side light and a centered composition.", Analysis: reverseAnalysis{Subject: "玻璃瓶", Composition: "居中构图", Lighting: "自然侧光", Style: "静物摄影"}, Uncertainties: []string{}}
}

func testReverseServer(t *testing.T, handler http.HandlerFunc) (*Service, *atomic.Int32) {
	t.Helper()
	t.Setenv("AI_CONFIG_ENCRYPTION_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	t.Setenv("BANANA_ROUTER_API_KEY", "")
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	s.ai = newAIConfigStore(s)
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec("INSERT INTO users(id,username,password_hash) VALUES('reverse-alice','reverse_alice','unused'),('reverse-bob','reverse_bob','unused')"); err != nil {
		t.Fatal(err)
	}
	count := &atomic.Int32{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count.Add(1)
		if handler != nil {
			handler(w, r)
			return
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("cannot read provider request")
		}
		if body["model"] != "deepseek-flash" || body["max_tokens"] != float64(4096) || r.URL.Path != "/v1/chat/completions" {
			t.Error("provider contract changed", body["model"], body["max_tokens"], r.URL.Path)
		}
		if body["thinking"].(map[string]any)["type"] != "disabled" {
			t.Error("reverse analysis should disable unnecessary thinking")
		}
		parts := body["messages"].([]any)[1].(map[string]any)["content"].([]any)
		if parts[1].(map[string]any)["image_url"].(map[string]any)["detail"] != "auto" {
			t.Error("image detail was downgraded")
		}
		result, _ := json.Marshal(validReverseResult())
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(result)}}}})
	}))
	t.Cleanup(upstream.Close)
	input := testEndpointInput("prompt", "openai_chat")
	input.BaseURL = "https://mock.example/v1"
	s.aiHTTPClient = mockUpstreamClient(upstream)
	input.Model = "deepseek-flash"
	input.Capabilities["vision"] = true
	if _, err := s.ai.save("", input); err != nil {
		t.Fatal(err)
	}
	return s, count
}

func reverseHTTP(t *testing.T, s *Service, method, path, uid string, fields map[string]string, data []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	contentType := ""
	if method == "POST" && path == "/v1/prompts/reverse" {
		writer := multipart.NewWriter(&body)
		for key, value := range fields {
			if err := writer.WriteField(key, value); err != nil {
				t.Fatal(err)
			}
		}
		if data != nil {
			file, err := writer.CreateFormFile("image", "reference.png")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = file.Write(data); err != nil {
				t.Fatal(err)
			}
		}
		if fields["includeAnalysis"] == "true" {
			file, err := writer.CreateFormFile("analysisImage", "analysis.png")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := file.Write(siteLogoBytes(t, "png")); err != nil {
				t.Fatal(err)
			}
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		contentType = writer.FormDataContentType()
	}
	r := httptest.NewRequest(method, path, &body)
	if uid != "" {
		r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: uid}))
	}
	if contentType != "" {
		r.Header.Set("Content-Type", contentType)
	}
	w := httptest.NewRecorder()
	s.router().ServeHTTP(w, r)
	return w
}

func responseReverseTask(t *testing.T, w *httptest.ResponseRecorder) reverseTask {
	t.Helper()
	if w.Code < 200 || w.Code >= 300 {
		t.Fatalf("task request: %d %s", w.Code, w.Body.String())
	}
	var data struct {
		Task reverseTask `json:"task"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	return data.Task
}

func createReverseTask(t *testing.T, s *Service, id, mode string) reverseTask {
	t.Helper()
	return responseReverseTask(t, reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"requestId": id, "mode": mode}, siteLogoBytes(t, "png")))
}

func TestReverseTasksArePrivateDurableAndIdempotent(t *testing.T) {
	s, calls := testReverseServer(t, nil)
	fields := map[string]string{"requestId": "same-request-001", "mode": "scene"}
	original := siteLogoBytes(t, "png")
	first := responseReverseTask(t, reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", fields, original))
	second := responseReverseTask(t, reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", fields, original))
	if first.ID != second.ID || calls.Load() != 0 {
		t.Fatal("duplicate request created another task")
	}
	fields["mode"] = "style"
	if w := reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", fields, original); w.Code != 409 {
		t.Fatal("changed request reused original task", w.Code)
	}
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	s.processReverseJob(job)
	result := responseReverseTask(t, reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+first.ID, "reverse-alice", nil, nil))
	if result.Status != "succeeded" || result.Result == nil || result.Result.Model != "deepseek-flash" || result.Result.TemplateVersion == "" || calls.Load() != 1 {
		t.Fatal("analysis result not persisted", result, calls.Load())
	}
	fields["mode"] = "scene"
	responseReverseTask(t, reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", fields, original))
	if calls.Load() != 1 {
		t.Fatal("completed request was billed twice")
	}
	fresh := &Service{db: s.db, storage: s.storage, secret: s.secret, storageRoot: s.storageRoot}
	if recovered := responseReverseTask(t, reverseHTTP(t, fresh, "GET", "/v1/prompts/reverse/"+first.ID, "reverse-alice", nil, nil)); recovered.Result.PromptZh != result.Result.PromptZh {
		t.Fatal("result lost after restart")
	}
	for _, path := range []string{"/v1/prompts/reverse/" + first.ID, "/v1/prompts/reverse/" + first.ID + "/image"} {
		if w := reverseHTTP(t, s, "GET", path, "reverse-bob", nil, nil); w.Code != 404 {
			t.Fatal("cross-account access", w.Code)
		}
		if w := reverseHTTP(t, s, "GET", path, "", nil, nil); w.Code != 401 {
			t.Fatal("anonymous access", w.Code)
		}
	}
	imageResponse := reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+first.ID+"/image", "reverse-alice", nil, nil)
	if !bytes.Equal(imageResponse.Body.Bytes(), original) {
		t.Fatal("original image was replaced by analysis thumbnail")
	}
	raw := reverseHTTP(t, s, "GET", "/v1/prompts/reverse", "reverse-alice", nil, nil).Body.String()
	if strings.Contains(raw, "system_prompt") || strings.Contains(raw, "sk-private") || strings.Contains(raw, "image_key") {
		t.Fatal("private metadata leaked")
	}
}

func TestReverseCancellationCannotBeOverwrittenByLateResults(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	s, calls := testReverseServer(t, func(w http.ResponseWriter, r *http.Request) {
		close(started)
		select {
		case <-r.Context().Done():
			return
		case <-release:
		}
		result, _ := json.Marshal(validReverseResult())
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": string(result)}}}})
	})
	t.Cleanup(func() { close(release) })
	task := createReverseTask(t, s, "cancel-request-001", "scene")
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { s.processReverseJob(job); close(done) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("provider not started")
	}
	cancelled := responseReverseTask(t, reverseHTTP(t, s, "POST", "/v1/prompts/reverse/"+task.ID+"/cancel", "reverse-alice", nil, nil))
	if cancelled.Status != "cancelled" {
		t.Fatal(cancelled.Status)
	}
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("cancel did not abort provider request")
	}
	result := validReverseResult()
	s.finishReverseJob(job, &result, "")
	if result := responseReverseTask(t, reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+task.ID, "reverse-alice", nil, nil)); result.Status != "cancelled" || result.Result != nil || calls.Load() != 1 {
		t.Fatal("late result resurrected cancellation", result)
	}
}

func TestReverseWorkerRejectsInvalidOutputWithoutAutomaticRetry(t *testing.T) {
	s, calls := testReverseServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": "not json"}}}})
	})
	task := createReverseTask(t, s, "invalid-output-001", "scene")
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	s.processReverseJob(job)
	result := responseReverseTask(t, reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+task.ID, "reverse-alice", nil, nil))
	if result.Status != "failed" || result.Result != nil || !strings.Contains(result.ErrorMessage, "完整结果") || calls.Load() != 1 {
		t.Fatal(result)
	}
	if _, err := s.claimReverseJob(); err == nil {
		t.Fatal("failed task retried automatically")
	}
}

func TestReverseQueueClaimsEachTaskOnceAndLimitsActiveTasks(t *testing.T) {
	s, _ := testReverseServer(t, nil)
	task := createReverseTask(t, s, "claim-request-001", "style")
	var count atomic.Int32
	var group sync.WaitGroup
	for i := 0; i < 6; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			job, err := s.claimReverseJob()
			if err == nil {
				if job.ID != task.ID {
					t.Error("wrong claim")
				}
				count.Add(1)
			}
		}()
	}
	group.Wait()
	if count.Load() != 1 {
		t.Fatal("task claimed multiple times", count.Load())
	}
	createReverseTask(t, s, "claim-request-002", "scene")
	w := reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"requestId": "claim-request-003", "mode": "scene"}, siteLogoBytes(t, "png"))
	if w.Code != 409 {
		t.Fatal("active task limit missing", w.Code)
	}
}

func TestAdministratorCannotPublishCustomerReverseImage(t *testing.T) {
	s, _ := testReverseServer(t, nil)
	task := createReverseTask(t, s, "cover-request-001", "scene")
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	s.processReverseJob(job)
	input := map[string]any{"title": "反推灵感", "category": "摄影", "prompt": "暖色主体", "enabled": false, "reverseTaskId": task.ID}
	w := inspirationRequest(t, s, "POST", "/v1/inspiration/prompts", input, "reverse-alice")
	if w.Code != 400 {
		t.Fatal("operator accessed customer image", w.Code)
	}
	var count int
	if err = s.db.QueryRow("SELECT count(*) FROM inspiration_prompts").Scan(&count); err != nil || count != 0 {
		t.Fatal("private image published", err)
	}
}

func TestReverseInputValidationAndOutputContract(t *testing.T) {
	valid := validReverseResult()
	raw, _ := json.Marshal(valid)
	if _, err := parseReverseResult("```json\n" + string(raw) + "\n```"); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*reverseResult){func(r *reverseResult) { r.PromptEn = "只有中文" }, func(r *reverseResult) { r.Analysis.Style = "" }, func(r *reverseResult) { r.PromptZh = strings.Repeat("长", 3000) }} {
		bad := valid
		mutate(&bad)
		raw, _ := json.Marshal(bad)
		if _, err := parseReverseResult(string(raw)); err == nil {
			t.Fatal("invalid result accepted")
		}
	}
	if _, _, _, err := validateReverseImage([]byte("<svg></svg>")); err == nil {
		t.Fatal("non-raster accepted")
	}
	data := siteLogoBytes(t, "png")
	if _, _, _, err := validateReverseImage(data[:len(data)/2]); err == nil {
		t.Fatal("truncated raster accepted")
	}
	source := image.NewNRGBA(image.Rect(0, 0, 3000, 1500))
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, source); err != nil {
		t.Fatal(err)
	}
	compressed, err := prepareReverseAnalysisData(buffer.Bytes(), "auto")
	if err != nil {
		t.Fatal(err)
	}
	decoded, _, err := image.Decode(bytes.NewReader(compressed))
	if err != nil || decoded.Bounds().Dx() != 1536 || decoded.Bounds().Dy() != 768 {
		t.Fatal("analysis dimensions incorrect", err)
	}
	_, _, _, alpha := decoded.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("transparent background was flattened")
	}
}

func TestReverseDisabledVisionAndTemplateDoNotCreateTasks(t *testing.T) {
	s, calls := testReverseServer(t, nil)
	if err := s.ai.withConfig(true, func(state *aiConfiguration) error {
		for i := range state.Endpoints {
			state.Endpoints[i].Capabilities["vision"] = false
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	w := reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"requestId": "disabled-vision-001", "mode": "scene"}, siteLogoBytes(t, "png"))
	if w.Code != 503 {
		t.Fatal(w.Code, w.Body.String())
	}
	if err := s.ai.withConfig(true, func(state *aiConfiguration) error {
		state.Endpoints[0].Capabilities["vision"] = true
		for i := range state.Templates {
			if state.Templates[i].Key == "reverse.scene" {
				state.Templates[i].Enabled = false
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	w = reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"requestId": "disabled-template-001", "mode": "scene"}, siteLogoBytes(t, "png"))
	if w.Code != 400 || calls.Load() != 0 {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestReverseSettingsValidationAndPersistence(t *testing.T) {
	s, _ := testReverseServer(t, nil)
	request := func(input string, uid string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("PUT", "/v1/prompt-reverse-settings", strings.NewReader(input))
		if uid != "" {
			r.Header.Set("Authorization", "Bearer "+s.testAdminToken(domain.User{ID: uid}))
		}
		w := httptest.NewRecorder()
		s.promptReverseSettingsHandler(w, r)
		return w
	}
	if request(`{"timeoutSeconds":120,"imageDetail":"high","retentionHours":24}`, "").Code != 401 {
		t.Fatal("settings not protected")
	}
	for _, input := range []string{`{"timeoutSeconds":0,"imageDetail":"auto","retentionHours":24}`, `{"timeoutSeconds":120,"imageDetail":"ultra","retentionHours":24}`, `{"timeoutSeconds":120,"imageDetail":"auto","retentionHours":0}`} {
		if w := request(input, "reverse-alice"); w.Code != 400 {
			t.Fatal("invalid settings accepted", w.Body.String())
		}
	}
	if w := request(`{"timeoutSeconds":180,"imageDetail":"high","retentionHours":48}`, "reverse-bob"); w.Code != 200 {
		t.Fatal("second user cannot save settings", w.Body.String())
	}
	settings, err := s.readReverseSettings()
	if err != nil || settings.TimeoutSeconds != 180 || settings.RetentionHours != 48 || settings.ImageDetail != "high" {
		t.Fatal("settings lost", settings, err)
	}
}

func TestReverseRecoveryFailsStaleJobsWithoutCallingProvider(t *testing.T) {
	s, calls := testReverseServer(t, nil)
	task := createReverseTask(t, s, "stale-request-001", "scene")
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec("UPDATE prompt_reverse_tasks SET deadline=now()-interval '1 second' WHERE id=$1", task.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.cleanupReverseTasks(); err != nil {
		t.Fatal(err)
	}
	result := responseReverseTask(t, reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+task.ID, "reverse-alice", nil, nil))
	if result.Status != "failed" || calls.Load() != 0 {
		t.Fatal("stale job billed again", result)
	}
	file, err := s.storage.Open(job.ImageKey)
	if err != nil {
		t.Fatal("stale source not retained")
	}
	_, _ = io.Copy(io.Discard, file)
	file.Close()
}

func TestReverseOriginalAndAnalysisImagesAreKeptSeparate(t *testing.T) {
	s, _ := testReverseServer(t, nil)
	original := siteLogoBytes(t, "jpeg")
	task := responseReverseTask(t, reverseHTTP(t, s, "POST", "/v1/prompts/reverse", "reverse-alice", map[string]string{"requestId": "dual-image-request-001", "mode": "scene", "includeAnalysis": "true"}, original))
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	if job.AnalysisKey == "" || job.AnalysisKey == job.ImageKey {
		t.Fatal("analysis image overwrote original")
	}
	s.processReverseJob(job)
	w := reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+task.ID+"/image", "reverse-alice", nil, nil)
	if w.Header().Get("Content-Type") != "image/jpeg" || !bytes.Equal(w.Body.Bytes(), original) {
		t.Fatal("original bytes or MIME changed")
	}
	if _, err := s.db.Exec("UPDATE prompt_reverse_tasks SET expires_at=now()-interval '1 second' WHERE id=$1", task.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.cleanupReverseTasks(); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{job.ImageKey, job.AnalysisKey} {
		if _, err := s.storage.Open(key); err == nil {
			t.Fatal("expired image remains", key)
		}
	}
}

func TestReverseManualClearRequiresCancellationAndOwnership(t *testing.T) {
	s, calls := testReverseServer(t, nil)
	task := createReverseTask(t, s, "manual-clear-request-001", "scene")
	path := "/v1/prompts/reverse/" + task.ID
	if w := reverseHTTP(t, s, "DELETE", path, "reverse-bob", nil, nil); w.Code != 404 {
		t.Fatal("foreign task can be cleared")
	}
	if w := reverseHTTP(t, s, "DELETE", path, "reverse-alice", nil, nil); w.Code != 409 {
		t.Fatal("running task can be cleared")
	}
	responseReverseTask(t, reverseHTTP(t, s, "POST", path+"/cancel", "reverse-alice", nil, nil))
	if w := reverseHTTP(t, s, "DELETE", path, "reverse-alice", nil, nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := reverseHTTP(t, s, "GET", path, "reverse-alice", nil, nil); w.Code != 404 || calls.Load() != 0 {
		t.Fatal("clear did not remove task")
	}
}

func portableReverseStyleFixture() map[string]any {
	return map[string]any{"styleTraits": map[string]any{
		"medium":      map[string]string{"zh": "简洁写实摄影", "en": "Clean photorealistic photography"},
		"composition": map[string]string{"zh": "居中对称，近景平视", "en": "Centered symmetry, close eye-level framing"},
		"lighting":    map[string]string{"zh": "柔和正面光，阴影轻浅", "en": "Soft frontal lighting with faint shadows"},
		"colors":      map[string]string{"zh": "白色为主，橙色与深蓝点缀", "en": "White dominant palette with orange and navy accents"},
		"texture":     map[string]string{"zh": "细腻哑光表面，清晰边缘", "en": "Fine matte surfaces and crisp edges"},
	}, "uncertainties": []string{}, "promptZh": "不应使用：白色T恤和齿轮图案", "promptEn": "Do not use: a white T-shirt with a gear print"}
}

func TestReverseStyleRejectsSceneCaptionsAndComposesPortableTraits(t *testing.T) {
	// The real provider returned valid JSON that nevertheless repeated the original subject.
	caption, _ := json.Marshal(validReverseResult())
	if _, err := parseReverseStyleResult(string(caption)); err == nil {
		t.Fatal("scene caption accepted as a transferable style")
	}
	fixture := portableReverseStyleFixture()
	raw, _ := json.Marshal(fixture)
	result, err := parseReverseStyleResult(string(raw))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(result.PromptZh, "T恤") || strings.Contains(result.PromptEn, "T-shirt") || result.Analysis.Subject != "" || result.Analysis.Scene != "" || result.Analysis.Text != "" {
		t.Fatal("full-scene output leaked into portable style", result)
	}
	delete(fixture["styleTraits"].(map[string]any), "lighting")
	raw, _ = json.Marshal(fixture)
	if _, err := parseReverseStyleResult(string(raw)); err == nil {
		t.Fatal("missing bilingual style trait accepted")
	}
	s, calls := testReverseServer(t, func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Content any `json:"content"`
			} `json:"messages"`
		}
		if json.NewDecoder(r.Body).Decode(&request) != nil {
			t.Error("request decode failed")
		}
		system, _ := request.Messages[0].Content.(string)
		if !strings.Contains(system, "styleTraits") || strings.Contains(system, `"subject":"主体"`) {
			t.Error("style task received a scene output contract")
		}
		answer, _ := json.Marshal(portableReverseStyleFixture())
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(answer)}}}})
	})
	task := createReverseTask(t, s, "portable-style-001", "style")
	job, err := s.claimReverseJob()
	if err != nil {
		t.Fatal(err)
	}
	s.processReverseJob(job)
	completed := responseReverseTask(t, reverseHTTP(t, s, "GET", "/v1/prompts/reverse/"+task.ID, "reverse-alice", nil, nil))
	if completed.Status != "succeeded" || completed.Result == nil || strings.Contains(completed.Result.PromptZh, "T恤") || calls.Load() != 1 {
		t.Fatal(completed)
	}
}
