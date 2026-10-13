package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func inspirationRequest(t *testing.T, s *server, method, path string, input any, uid string) *httptest.ResponseRecorder {
	t.Helper()
	var body []byte
	if input != nil {
		var err error
		body, err = json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	if uid != "" {
		r.Header.Set("Authorization", "Bearer "+s.token(user{ID: uid}))
	}
	w := httptest.NewRecorder()
	if r.URL.Path == "/v1/inspiration/categories" {
		s.inspirationCategories(w, r)
	} else if strings.HasPrefix(r.URL.Path, "/v1/inspiration/prompts/") {
		s.inspirationPromptByID(w, r)
	} else {
		s.inspirationPrompts(w, r)
	}
	return w
}

func readInspirationList(t *testing.T, w *httptest.ResponseRecorder) []inspirationPromptRow {
	t.Helper()
	if w.Code != 200 {
		t.Fatalf("list status: %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Prompts []inspirationPromptRow `json:"prompts"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result.Prompts
}

func TestInspirationManagementCRUDAndPublicVisibility(t *testing.T) {
	t.Setenv("CDN_BASE_URL", "")
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec("INSERT INTO inspiration_prompts(id,title,category,prompt,source,image_key,image_width,image_height,enabled) VALUES('imported','旧案例','摄影','原始提示词','作者','case-demo.png',320,180,false)"); err != nil {
		t.Fatal(err)
	}
	imagePath := filepath.Join(s.storageRoot, "inspiration", "case-demo.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(imagePath, siteLogoBytes(t, "png"), 0644); err != nil {
		t.Fatal(err)
	}
	if rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, "")); len(rows) != 0 {
		t.Fatal("disabled prompt leaked to public library")
	}
	rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?includeDisabled=true", nil, "second-account"))
	if len(rows) != 1 || rows[0].Enabled || rows[0].ImageURL != "/v1/inspiration/images/case-demo.png" {
		t.Fatal("management did not include disabled imported prompt", rows)
	}
	input := map[string]any{"title": "  新灵感  ", "category": "插画", "prompt": "多行提示词\n第二行保留", "source": "测试作者", "sortOrder": -1}
	w := inspirationRequest(t, s, "POST", "/v1/inspiration/prompts", input, "second-account")
	if w.Code != 201 {
		t.Fatal("signed-in account cannot create inspiration", w.Body.String())
	}
	var created struct {
		Prompt inspirationPromptRow `json:"prompt"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Prompt.Title != "新灵感" || !created.Prompt.Enabled || created.Prompt.Prompt != input["prompt"] || created.Prompt.ImageURL != "" {
		t.Fatal("creation defaults or multiline content were lost", created)
	}
	for _, q := range []string{"插画", "测试作者", "第二行"} {
		rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?q="+q, nil, ""))
		if len(rows) != 1 || rows[0].ID != created.Prompt.ID {
			t.Fatal("search did not match category, source or prompt", q, rows)
		}
	}
	for _, status := range []string{"enabled", "disabled"} {
		rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?includeDisabled=true&status="+status, nil, "second-account"))
		if len(rows) != 1 || rows[0].Enabled != (status == "enabled") {
			t.Fatal("status filter failed", status, rows)
		}
	}
	rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?includeDisabled=true&pageSize=1&page=2", nil, "second-account"))
	if len(rows) != 1 || rows[0].ID != "imported" {
		t.Fatal("management pagination failed", rows)
	}
	input["title"] = "已编辑案例"
	input["enabled"] = true
	w = inspirationRequest(t, s, "PUT", "/v1/inspiration/prompts/imported", input, "another-account")
	if w.Code != 200 {
		t.Fatal("shared prompt cannot be edited by another signed-in account", w.Body.String())
	}
	var imageKey string
	var width, height int
	if err := s.db.QueryRow("SELECT image_key,image_width,image_height FROM inspiration_prompts WHERE id='imported'").Scan(&imageKey, &width, &height); err != nil || imageKey != "case-demo.png" || width != 320 || height != 180 {
		t.Fatal("editing removed imported image metadata", imageKey, width, height, err)
	}
	rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, ""))
	if len(rows) != 2 {
		t.Fatal("enabled edit was not visible publicly", rows)
	}
	for _, id := range []string{"imported", created.Prompt.ID} {
		w = inspirationRequest(t, s, "DELETE", "/v1/inspiration/prompts/"+id, nil, "second-account")
		if w.Code != 200 {
			t.Fatal("delete failed", w.Body.String())
		}
	}
	if _, err := os.Stat(imagePath); err != nil {
		t.Fatal("deleting a prompt removed its shared example image", err)
	}
	rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?includeDisabled=true", nil, "second-account"))
	if len(rows) != 0 {
		t.Fatal("deleted prompts were still listed", rows)
	}
	w = inspirationRequest(t, s, "DELETE", "/v1/inspiration/prompts/imported", nil, "second-account")
	if w.Code != 404 {
		t.Fatal("repeat deletion did not report missing prompt", w.Code)
	}
}

func TestInspirationManagementRequiresLoginAndDatabase(t *testing.T) {
	s := testSiteServer(t)
	for _, test := range []struct{ method, path string }{{"POST", "/v1/inspiration/prompts"}, {"PUT", "/v1/inspiration/prompts/id"}, {"DELETE", "/v1/inspiration/prompts/id"}, {"GET", "/v1/inspiration/prompts?includeDisabled=true"}, {"GET", "/v1/inspiration/categories?includeDisabled=true"}} {
		w := inspirationRequest(t, s, test.method, test.path, map[string]string{}, "")
		if w.Code != 401 {
			t.Fatal("anonymous management was accepted", test, w.Code)
		}
		w = inspirationRequest(t, s, test.method, test.path, map[string]string{}, "second-account")
		if w.Code != 503 || !strings.Contains(w.Body.String(), "INSPIRATION_DATABASE_REQUIRED") {
			t.Fatal("missing database was not explained", test, w.Code, w.Body.String())
		}
	}
}

func TestManagementCategoriesIncludeDisabledOnlyCategories(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt,enabled,sort_order) VALUES
		('public','人像','人像摄影','内容',true,1),
		('draft','人像草稿','人像摄影','内容',false,2),
		('private','未启用服装','服装','内容',false,3)`); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		query, user string
		want        map[string]int
	}{
		{"", "", map[string]int{"人像摄影": 1}},
		{"?includeDisabled=true", "second-account", map[string]int{"人像摄影": 2, "服装": 1}},
	} {
		w := inspirationRequest(t, s, "GET", "/v1/inspiration/categories"+test.query, nil, test.user)
		var data struct {
			Categories []struct {
				Category string `json:"category"`
				Count    int    `json:"count"`
			} `json:"categories"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &data) != nil || len(data.Categories) != len(test.want) {
			t.Fatal("unexpected categories response", w.Code, w.Body.String())
		}
		for _, item := range data.Categories {
			if test.want[item.Category] != item.Count {
				t.Fatal("disabled category count was wrong", item)
			}
		}
	}
}

func TestInspirationManagementValidationDoesNotChangeRecords(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	for _, patch := range []map[string]any{
		{"title": ""}, {"category": ""}, {"prompt": " "}, {"title": strings.Repeat("名", 161)}, {"category": strings.Repeat("名", 81)}, {"prompt": strings.Repeat("字", 20001)}, {"source": strings.Repeat("名", 501)}, {"sortOrder": 1000001}, {"sortOrder": "invalid"},
	} {
		input := map[string]any{"title": "标题", "category": "分类", "prompt": "内容", "enabled": true}
		for key, value := range patch {
			input[key] = value
		}
		w := inspirationRequest(t, s, "POST", "/v1/inspiration/prompts", input, "second-account")
		if w.Code != 400 {
			t.Fatal("invalid inspiration was accepted", patch, w.Code, w.Body.String())
		}
	}
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM inspiration_prompts").Scan(&count); err != nil || count != 0 {
		t.Fatal("invalid submissions were persisted", count, err)
	}
	w := inspirationRequest(t, s, "PUT", "/v1/inspiration/prompts/missing", map[string]any{"title": "标题", "category": "分类", "prompt": "内容"}, "second-account")
	if w.Code != 404 {
		t.Fatal("editing missing record created a new prompt", w.Code)
	}
}

func TestInspirationManagementCategorySearchCombinesFiltersAndPagination(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt,enabled,sort_order) VALUES
		('coat-enabled','服装主图','服装摄影','蓝色外套',true,1),
		('coat-disabled','服装主图草稿','服装摄影','蓝色外套',false,2),
		('shirt-disabled','衬衫草稿','服装设计','白色衬衫',false,3),
		('portrait','人像','人像摄影','服装摄影风格',true,4)`); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		query string
		ids   []string
	}{
		{"categoryQuery=服装", []string{"coat-enabled"}},
		{"includeDisabled=true&categoryQuery=服装", []string{"coat-enabled", "coat-disabled", "shirt-disabled"}},
		{"includeDisabled=true&categoryQuery=服装&status=disabled&q=蓝色", []string{"coat-disabled"}},
		{"includeDisabled=true&categoryQuery=服装&pageSize=1&page=2", []string{"coat-disabled"}},
		{"includeDisabled=true&category=服装摄影&categoryQuery=设计", nil},
		{"includeDisabled=true&categoryQuery=" + url.QueryEscape("' OR true --"), nil},
	} {
		rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?"+test.query, nil, "signed-in-account"))
		if len(rows) != len(test.ids) {
			t.Fatalf("%s: got %d rows, want %d", test.query, len(rows), len(test.ids))
		}
		for index, row := range rows {
			if row.ID != test.ids[index] {
				t.Fatalf("%s: unexpected row %q", test.query, row.ID)
			}
		}
	}
}
