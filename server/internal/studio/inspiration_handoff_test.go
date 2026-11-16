package studio

import (
	"encoding/json"
	"testing"
)

func TestPublicInspirationHandoffIncludesRequirementsAndHidesUnpublished(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt,enabled,instructions,requires_reference) VALUES
		('public-handoff','商品模板','电商','{{商品}} 的清晰主图',true,'上传商品正面图',true),
		('private-handoff','未发布模板','电商','私有内容',false,'私人说明',true)`); err != nil {
		t.Fatal(err)
	}
	w := inspirationRequest(t, s, "GET", "/v1/inspiration/prompts/public-handoff", nil, "")
	var data struct {
		Prompt inspirationPromptRow `json:"prompt"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &data) != nil {
		t.Fatal("public template handoff failed", w.Code, w.Body.String())
	}
	if data.Prompt.ID != "public-handoff" || data.Prompt.Prompt != "{{商品}} 的清晰主图" || !data.Prompt.RequiresReference || data.Prompt.Instructions != "上传商品正面图" {
		t.Fatal("handoff lost template content or requirements", data.Prompt)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("published template detail must not outlive withdrawal")
	}
	for _, id := range []string{"private-handoff", "missing"} {
		for _, user := range []string{"", "admin-reader"} {
			w = inspirationRequest(t, s, "GET", "/v1/inspiration/prompts/"+id+"?includeDisabled=true", nil, user)
			if w.Code != 404 {
				t.Fatal("public detail exposed an unpublished template", id, user, w.Code, w.Body.String())
			}
		}
	}
	if _, err := s.db.Exec("UPDATE inspiration_prompts SET enabled=false WHERE id='public-handoff'"); err != nil {
		t.Fatal(err)
	}
	w = inspirationRequest(t, s, "GET", "/v1/inspiration/prompts/public-handoff", nil, "")
	if w.Code != 404 {
		t.Fatal("withdrawn template remained readable", w.Code, w.Body.String())
	}
}

func TestPublicInspirationHandoffReportsUnavailableStorage(t *testing.T) {
	s := testSiteServer(t)
	w := inspirationRequest(t, s, "GET", "/v1/inspiration/prompts/template", nil, "")
	if w.Code != 503 {
		t.Fatal("unavailable storage did not produce a retryable response", w.Code, w.Body.String())
	}
}
