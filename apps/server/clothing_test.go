package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func clothingFixture(mode string, counts map[string]int) map[string]any {
	input := map[string]any{"mode": "commerce", "taskType": "clothing-set", "productAssetIds": []string{"garment"}, "clothingMode": mode, "moduleCounts": counts, "clothingPlan": baseClothingPlan(mode, counts, "").Shots}
	total := 0
	for _, n := range counts {
		total += n
	}
	input["count"] = total
	if mode == "model" {
		input["modelAssetId"] = "model"
		input["sceneAssetId"] = "scene"
	}
	raw, _ := json.Marshal(input)
	var parsed map[string]any
	_ = json.Unmarshal(raw, &parsed)
	return parsed
}

func TestClothingValidation(t *testing.T) {
	for _, mode := range []string{"product", "model"} {
		counts := map[string]int{"clothing-front": 1, "clothing-detail": 2}
		if mode == "model" {
			counts = map[string]int{"clothing-model": 4}
		}
		if err := validateGenerationInput(clothingFixture(mode, counts)); err != nil {
			t.Fatalf("valid %s input: %v", mode, err)
		}
	}
	tests := []struct {
		name   string
		change func(map[string]any)
	}{
		{"missing model", func(v map[string]any) { v["clothingMode"] = "model"; delete(v, "modelAssetId") }},
		{"product with scene", func(v map[string]any) { v["sceneAssetId"] = "scene" }},
		{"wrong total", func(v map[string]any) { v["count"] = float64(4) }},
		{"fraction", func(v map[string]any) { v["moduleCounts"].(map[string]any)["clothing-front"] = 1.5 }},
		{"extra module", func(v map[string]any) { v["moduleCounts"].(map[string]any)["hero"] = float64(1) }},
		{"duplicate shot", func(v map[string]any) {
			shots := v["clothingPlan"].([]any)
			shots[1].(map[string]any)["id"] = shots[0].(map[string]any)["id"]
		}},
		{"empty description", func(v map[string]any) { v["clothingPlan"].([]any)[0].(map[string]any)["description"] = " " }},
		{"unexpected reference", func(v map[string]any) { v["referenceAssetIds"] = []any{"other"} }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := clothingFixture("product", map[string]int{"clothing-front": 1, "clothing-detail": 1})
			tt.change(input)
			if validateGenerationInput(input) == nil {
				t.Fatal("accepted invalid clothing plan")
			}
		})
	}
	if _, err := validateClothingCounts("product", map[string]int{"clothing-front": 4, "clothing-back": 4, "clothing-3d": 4, "clothing-detail": 4, "clothing-selling": 1}); err == nil {
		t.Fatal("accepted more than 16")
	}
}

type clothingBatchProvider struct {
	batchProvider
	ids []string
}

func (p *clothingBatchProvider) Submit(ctx context.Context, input map[string]any) (providerTask, error) {
	p.ids = append(p.ids, stringValue(input["taskId"], ""))
	return p.batchProvider.Submit(ctx, input)
}
func TestClothingConfirmedPlanControlsEachRequest(t *testing.T) {
	for _, failAt := range []int{0, 2} {
		provider := &clothingBatchProvider{batchProvider: batchProvider{failAt: failAt}}
		q := &taskQueue{server: &server{tasks: map[string]task{}, provider: provider}}
		input := clothingFixture("product", map[string]int{"clothing-front": 1, "clothing-detail": 1})
		// Confirmed order and custom descriptions must take precedence over sorted module keys.
		shots := input["clothingPlan"].([]any)
		shots[0], shots[1] = shots[1], shots[0]
		shots[0].(map[string]any)["description"] = "用户确认的袖口近景"
		input["taskId"] = "original"
		input["moduleHint"] = "original-hint"
		images, modules, err := q.generateBatches("group", input)
		if failAt == 0 {
			if err != nil || len(images) != 2 || !reflect.DeepEqual(modules, []string{"clothing-detail", "clothing-front"}) {
				t.Fatalf("generation: %v %v %v", images, modules, err)
			}
		} else if err == nil || len(images) != 1 || len(modules) != 1 || !strings.Contains(err.Error(), "正面精修") {
			t.Fatalf("lost partial result: %v %v %v", images, modules, err)
		}
		if provider.hints[0] != "用户确认的袖口近景" || !reflect.DeepEqual(provider.ids, []string{"group-clothing-1", "group-clothing-2"}) {
			t.Fatalf("wrong per-shot request: %v %v", provider.hints, provider.ids)
		}
		for _, n := range provider.counts {
			if n != 1 {
				t.Fatal("each shot must request one image")
			}
		}
		if intValue(input["count"], 0) != 2 || input["taskId"] != "original" || input["moduleHint"] != "original-hint" {
			t.Fatal("queue changed confirmed task input")
		}
	}
}

func clothingAnalysisRequest(t *testing.T, token, mode string, model, scene bool) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	counts := map[string]int{"clothing-back": 1}
	if mode == "model" {
		counts = map[string]int{"clothing-model": 2}
	}
	raw, _ := json.Marshal(counts)
	for key, value := range map[string]string{"clothingMode": mode, "moduleCounts": string(raw), "clothingStyle": "natural", "aspectRatio": "3:4", "platform": "taobao", "outputLanguage": "none", "requirements": "保持蓝色领口"} {
		_ = writer.WriteField(key, value)
	}
	keys := []string{"garmentImages"}
	if model {
		keys = append(keys, "modelImage")
	}
	if scene {
		keys = append(keys, "sceneImage")
	}
	for _, key := range keys {
		part, err := writer.CreateFormFile(key, "photo.png")
		if err != nil {
			t.Fatal(err)
		}
		_, _ = part.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
	}
	_ = writer.Close()
	req := httptest.NewRequest(http.MethodPost, "/v1/clothing/plan", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}
func TestClothingAnalysisRolesAndInvalidAI(t *testing.T) {
	expected := baseClothingPlan("model", map[string]int{"clothing-model": 2}, "")
	raw, _ := json.Marshal(expected)
	client := &fakePromptClient{reply: string(raw)}
	s := &server{secret: []byte("test-secret"), promptClient: client}
	token := s.testToken(user{ID: "user-1", Username: "demo"})
	call := func(token, mode string, model, scene bool) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		s.clothingPlanHandler(rec, clothingAnalysisRequest(t, token, mode, model, scene))
		return rec
	}
	if rec := call(token, "model", true, true); rec.Code != 200 || client.images != 3 || !strings.Contains(client.lastText, "图片 2：模特参考") || !strings.Contains(client.lastText, "图片 3：场景参考") || !strings.Contains(client.lastText, "保持蓝色领口") {
		t.Fatalf("roles not respected: %d %s", rec.Code, rec.Body.String())
	}
	if rec := call("", "model", true, true); rec.Code != 401 {
		t.Fatal("analysis is not protected")
	}
	if rec := call(token, "model", false, false); rec.Code != 400 {
		t.Fatal("accepted missing model")
	}
	if rec := call(token, "product", true, false); rec.Code != 400 {
		t.Fatal("accepted model in product mode")
	}
	expected.Shots[0].ID = "unexpected"
	raw, _ = json.Marshal(expected)
	client.reply = string(raw)
	if rec := call(token, "model", true, false); rec.Code != 502 {
		t.Fatal("accepted changed AI shot IDs")
	}
	client.reply = "not json"
	if rec := call(token, "model", true, false); rec.Code != 502 {
		t.Fatal("accepted malformed AI response")
	}
	expected = baseClothingPlan("product", map[string]int{"clothing-back": 1}, "")
	expected.Warnings = nil
	raw, _ = json.Marshal(expected)
	client.reply = string(raw)
	rec := call(token, "product", false, false)
	var plan clothingPlan
	_ = json.Unmarshal(rec.Body.Bytes(), &plan)
	if rec.Code != 200 || len(plan.Warnings) == 0 {
		t.Fatal("back uncertainty was lost")
	}
}

func TestClothingAssetOwnershipRolesAndZip(t *testing.T) {
	db := isolatedTestDatabase(t)
	storage := newLocalStorage(t.TempDir())
	s := &server{db: db, storage: storage, secret: []byte("test-secret")}
	for _, uid := range []string{"owner", "other"} {
		if _, err := db.Exec("INSERT INTO users(id,username,password_hash) VALUES($1,$1,'x')", uid); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"garment", "model", "scene", "foreign"} {
		uid := "owner"
		if id == "foreign" {
			uid = "other"
		}
		if _, err := db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes) VALUES($1,$2,$1,$1,'image/png',8)", id, uid); err != nil {
			t.Fatal(err)
		}
		if err := storage.Save(id, strings.NewReader("image-"+id)); err != nil {
			t.Fatal(err)
		}
	}
	input := clothingFixture("model", map[string]int{"clothing-model": 2})
	if err := s.validateInputOwnership("owner", input); err != nil {
		t.Fatal(err)
	}
	input["sceneAssetId"] = "foreign"
	if s.validateInputOwnership("owner", input) == nil {
		t.Fatal("accepted another user's scene")
	}
	input["sceneAssetId"] = "scene"
	input["modelAssetId"] = "foreign"
	if s.validateInputOwnership("owner", input) == nil {
		t.Fatal("accepted another user's model")
	}
	input["modelAssetId"] = "model"
	if err := s.attachSourceImages(input); err != nil {
		t.Fatal(err)
	}
	sources := sourceImages(input)
	if len(sources) != 3 || sources[0]["role"] != "garment" || sources[1]["role"] != "model" || sources[2]["role"] != "scene" {
		t.Fatalf("source roles: %v", sources)
	}
	input["moduleHint"] = "用户确认的侧面站姿"
	prompt := promptForInput(input)
	for _, text := range []string{"参考图片 1：服装原图", "参考图片 2：模特参考", "参考图片 3：场景参考", "用户确认的侧面站姿", "不新增"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("missing prompt policy %q: %s", text, prompt)
		}
	}
	if _, err := db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input,result_images,result_modules) VALUES('group','owner','succeeded','{}','["/v1/assets/garment/content","/v1/assets/model/content"]','["clothing-front","clothing-detail"]')`); err != nil {
		t.Fatal(err)
	}
	download := func(uid string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/v1/generation/tasks/group/download", nil)
		if uid != "" {
			req.Header.Set("Authorization", "Bearer "+s.testToken(user{ID: uid, Username: uid}))
		}
		rec := httptest.NewRecorder()
		s.taskByID(rec, req)
		return rec
	}
	rec := download("owner")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("archive failed: %d %s", rec.Code, rec.Body.String())
	}
	archive, err := zip.NewReader(bytes.NewReader(rec.Body.Bytes()), int64(rec.Body.Len()))
	if err != nil || len(archive.File) != 2 {
		t.Fatalf("archive %v", err)
	}
	for i, file := range archive.File {
		r, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(r)
		r.Close()
		if !strings.HasPrefix(string(data), "image-") || !strings.HasPrefix(file.Name, []string{"01_正面精修", "02_细节特写"}[i]) {
			t.Fatalf("archive entry: %s %s", file.Name, data)
		}
	}
	if download("").Code != 401 || download("other").Code != 404 {
		t.Fatal("archive leaks other users' tasks")
	}
	if _, err := db.Exec(`UPDATE generation_tasks SET result_images='["/v1/assets/foreign/content"]' WHERE id='group'`); err != nil {
		t.Fatal(err)
	}
	if download("owner").Code != 404 {
		t.Fatal("archive leaks a foreign asset")
	}
}
