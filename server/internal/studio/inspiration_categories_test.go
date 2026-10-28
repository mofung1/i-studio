package studio

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"github.com/istudio/server/internal/database"
)

func managedCategories(t *testing.T, s *Service) []inspirationCategoryRow {
	t.Helper()
	w := inspirationRequest(t, s, "GET", "/v1/inspiration/categories?includeDisabled=true", nil, "member")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var data struct {
		Categories []inspirationCategoryRow `json:"categories"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	return data.Categories
}

func newTestCategory(t *testing.T, s *Service, name string) inspirationCategoryRow {
	t.Helper()
	w := inspirationRequest(t, s, "POST", "/v1/inspiration/categories", map[string]string{"name": name}, "member")
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var data struct {
		Category inspirationCategoryRow `json:"category"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	return data.Category
}

func TestCategoryOrderPersistsAndControlsPublicListWithoutChangingPrompts(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	first := newTestCategory(t, s, "第一类")
	second := newTestCategory(t, s, "第二类")
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt,enabled,sort_order) VALUES('one','第一张','第一类','保留',true,1),('two','第二张','第二类','保留',true,2)`); err != nil {
		t.Fatal(err)
	}
	w := inspirationRequest(t, s, "PUT", "/v1/inspiration/categories/"+second.ID, map[string]int{"sortOrder": -10}, "member")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	rows := managedCategories(t, s)
	if len(rows) != 2 || rows[0].ID != second.ID || rows[0].SortOrder != -10 || rows[1].ID != first.ID {
		t.Fatal(rows)
	}
	public := inspirationRequest(t, s, "GET", "/v1/inspiration/categories", nil, "")
	var response struct {
		Categories []inspirationCategoryRow `json:"categories"`
	}
	if err := json.Unmarshal(public.Body.Bytes(), &response); err != nil || len(response.Categories) != 2 || response.Categories[0].ID != second.ID {
		t.Fatal(public.Body.String(), err)
	}
	var order int
	if err := s.db.QueryRow("SELECT sort_order FROM inspiration_prompts WHERE id='two'").Scan(&order); err != nil || order != 2 {
		t.Fatal("category reorder changed prompt order", order, err)
	}
	invalid := inspirationRequest(t, s, "PUT", "/v1/inspiration/categories/"+second.ID, map[string]int{"sortOrder": 1000001}, "member")
	if invalid.Code != 400 {
		t.Fatal(invalid.Code)
	}
}

func TestCategoryRegistrationEmptyPersistenceRenameAndStableSelection(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt,image_key,image_width,enabled,sort_order) VALUES('legacy','原始标题','摄影','保留原始内容','source.jpg',400,true,1),('draft','草稿','摄影','草稿内容','',0,false,2)`); err != nil {
		t.Fatal(err)
	}
	imported := managedCategories(t, s)
	if len(imported) != 1 || imported[0].Count != 2 || imported[0].EnabledCount != 1 || imported[0].ID == "" {
		t.Fatal("legacy categories not registered", imported)
	}
	empty := newTestCategory(t, s, "  未使用分类  ")
	if empty.Category != "未使用分类" || empty.Count != 0 {
		t.Fatal("empty category not normalized/persisted")
	}
	if len(managedCategories(t, s)) != 2 {
		t.Fatal("empty category disappeared")
	}
	public := inspirationRequest(t, s, "GET", "/v1/inspiration/categories", nil, "")
	if public.Code != 200 || strings.Contains(public.Body.String(), "未使用分类") || !strings.Contains(public.Body.String(), `"count":1`) {
		t.Fatal("public list includes empty/disabled prompts", public.Body.String())
	}
	id := imported[0].ID
	w := inspirationRequest(t, s, "PUT", "/v1/inspiration/categories/"+id, map[string]string{"name": "商品摄影"}, "another-account")
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var category, content, imageKey string
	var width int
	var enabled bool
	if err := s.db.QueryRow("SELECT category,prompt,image_key,image_width,enabled FROM inspiration_prompts WHERE id='legacy'").Scan(&category, &content, &imageKey, &width, &enabled); err != nil || category != "商品摄影" || content != "保留原始内容" || imageKey != "source.jpg" || width != 400 || !enabled {
		t.Fatal("rename damaged existing prompt", err)
	}
	// A form opened before a rename sends its old display name but its stable category ID wins.
	input := map[string]any{"title": "新提示词", "category": "摄影", "categoryId": id, "prompt": "新的内容", "enabled": false}
	w = inspirationRequest(t, s, "POST", "/v1/inspiration/prompts", input, "member")
	if w.Code != 201 || !strings.Contains(w.Body.String(), `"category":"商品摄影"`) {
		t.Fatal("stale form recreated old category", w.Body.String())
	}
	if err := database.Migrate(s.db); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, row := range managedCategories(t, s) {
		if row.Category == "摄影" {
			t.Fatal("old name returned after restart")
		}
		if row.ID == id && row.Category == "商品摄影" && row.Count == 3 {
			found = true
		}
	}
	if !found {
		t.Fatal("rename lost identity or disabled references")
	}
	w = inspirationRequest(t, s, "DELETE", "/v1/inspiration/categories/"+empty.ID, nil, "member")
	if w.Code != 200 {
		t.Fatal("empty deletion requires a body", w.Body.String())
	}
}

func TestDeletingUsedCategoryRequiresAtomicMoveAndKeepsPrompts(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	source := newTestCategory(t, s, "原分类")
	target := newTestCategory(t, s, "接收分类")
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt,image_key,enabled) VALUES('a','标题A','原分类','正文A','a.jpg',true),('b','标题B','原分类','正文B','b.jpg',false)`); err != nil {
		t.Fatal(err)
	}
	for _, input := range []any{nil, map[string]string{"moveToId": source.ID}, map[string]string{"moveToId": "missing"}} {
		w := inspirationRequest(t, s, "DELETE", "/v1/inspiration/categories/"+source.ID, input, "member")
		if w.Code != 409 && w.Code != 400 {
			t.Fatal("unsafe category deletion accepted", w.Body.String())
		}
	}
	w := inspirationRequest(t, s, "DELETE", "/v1/inspiration/categories/"+source.ID, map[string]string{"moveToId": target.ID}, "member")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"movedCount":2`) {
		t.Fatal("migration failed", w.Body.String())
	}
	rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?includeDisabled=true", nil, "member"))
	if len(rows) != 2 {
		t.Fatal("category deletion deleted prompts")
	}
	for _, row := range rows {
		if row.Category != "接收分类" || row.Prompt == "" || row.ImageURL == "" {
			t.Fatal("move damaged prompt metadata", row)
		}
	}
	categories := managedCategories(t, s)
	if len(categories) != 1 || categories[0].ID != target.ID || categories[0].Count != 2 || categories[0].EnabledCount != 1 {
		t.Fatal("category count/visibility not updated", categories)
	}
	if w := inspirationRequest(t, s, "DELETE", "/v1/inspiration/categories/"+source.ID, nil, "member"); w.Code != 404 {
		t.Fatal("deleted category still exists")
	}
}

func TestCategoryValidationAuthorizationAndConflicts(t *testing.T) {
	s := testSiteServer(t)
	for _, request := range []struct{ method, path string }{{"POST", "/v1/inspiration/categories"}, {"PUT", "/v1/inspiration/categories/id"}, {"DELETE", "/v1/inspiration/categories/id"}} {
		if w := inspirationRequest(t, s, request.method, request.path, map[string]string{"name": "新分类"}, ""); w.Code != 401 {
			t.Fatal("anonymous category mutation allowed")
		}
		if w := inspirationRequest(t, s, request.method, request.path, map[string]string{"name": "新分类"}, "member"); w.Code != 503 {
			t.Fatal("missing database not explained")
		}
	}
	s.db = isolatedTestDatabase(t)
	first := newTestCategory(t, s, "第一类")
	second := newTestCategory(t, s, "第二类")
	for _, name := range []string{" ", strings.Repeat("字", 81)} {
		if w := inspirationRequest(t, s, "POST", "/v1/inspiration/categories", map[string]string{"name": name}, "member"); w.Code != 400 {
			t.Fatal("invalid name accepted")
		}
	}
	if w := inspirationRequest(t, s, "POST", "/v1/inspiration/categories", map[string]string{"name": " 第一类 "}, "member"); w.Code != 409 {
		t.Fatal("duplicate category accepted")
	}
	if w := inspirationRequest(t, s, "PUT", "/v1/inspiration/categories/"+second.ID, map[string]string{"name": first.Category}, "member"); w.Code != 409 {
		t.Fatal("rename collision accepted")
	}
	if w := inspirationRequest(t, s, "PUT", "/v1/inspiration/categories/missing", map[string]string{"name": "新分类"}, "member"); w.Code != 404 {
		t.Fatal("missing category reported success")
	}
}

func TestPromptSaveConcurrentWithRenameUsesOneCanonicalCategory(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	category := newTestCategory(t, s, "旧分类")
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	wg.Add(2)
	go func() {
		defer wg.Done()
		codes <- inspirationRequest(t, s, "PUT", "/v1/inspiration/categories/"+category.ID, map[string]string{"name": "新分类"}, "member").Code
	}()
	go func() {
		defer wg.Done()
		codes <- inspirationRequest(t, s, "POST", "/v1/inspiration/prompts", map[string]any{"title": "并发保存", "category": "旧分类", "categoryId": category.ID, "prompt": "保留内容"}, "member").Code
	}()
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != 200 && code != 201 {
			t.Fatal("concurrent edit failed", code)
		}
	}
	rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts?includeDisabled=true", nil, "member"))
	categories := managedCategories(t, s)
	if len(rows) != 1 || rows[0].Category != "新分类" || len(categories) != 1 || categories[0].ID != category.ID || categories[0].Category != "新分类" {
		t.Fatal("concurrent edits recreated an orphan category", rows, categories)
	}
}
