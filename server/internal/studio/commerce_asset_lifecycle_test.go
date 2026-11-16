package studio

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestCommerceAssetMaskReferencesProtectActiveAndRetry(t *testing.T) {
	s, _, input, _, _ := productMaskFixture(t)
	s.queue = &taskQueue{server: s, fallback: make(chan string, 4)}
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		t.Error("asset lifecycle test must not call an image provider")
		return providerTask{}, fmt.Errorf("unexpected provider call")
	}}
	w := submitProductMask(t, s, input, "mask-lifecycle-first")
	var body struct {
		Task domain.GenerationTask `json:"task"`
	}
	if w.Code != 202 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	token := s.testToken(domain.User{ID: "member"})
	remove := func() *httptest.ResponseRecorder {
		return operationRequest(s, "DELETE", "/v1/assets/mask-good", "", token, s.router().ServeHTTP)
	}
	if removed := remove(); removed.Code != 409 {
		t.Fatal("mask used by active task was removed", removed.Code, removed.Body.String())
	}
	s.updateTaskResult(body.Task.ID, "failed", nil, nil, "fixture failure")
	if removed := remove(); removed.Code != 200 {
		t.Fatal(removed.Code, removed.Body.String())
	}
	var hidden bool
	if err := s.db.QueryRow("SELECT hidden_at IS NOT NULL FROM assets WHERE id='mask-good'").Scan(&hidden); err != nil || !hidden {
		t.Fatal("terminal task mask was physically removed", hidden, err)
	}
	if _, err := s.db.Exec("UPDATE assets SET hidden_at=now()-interval '8 days' WHERE id='mask-good'"); err != nil {
		t.Fatal(err)
	}
	if err := s.cleanupHiddenAssets(); err != nil {
		t.Fatal(err)
	}
	file, err := s.storage.Open("mask-good.png")
	if err != nil {
		t.Fatal("historical mask bytes removed by cleanup", err)
	}
	file.Close()
	req := httptest.NewRequest("POST", "/v1/generation/tasks/"+body.Task.ID+"/retry", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Idempotency-Key", "mask-lifecycle-retry")
	req.Header.Set("X-Expected-Unit-Price", "125")
	retried := httptest.NewRecorder()
	s.router().ServeHTTP(retried, req)
	if retried.Code != 202 {
		t.Fatal("hidden historical mask cannot be retried", retried.Code, retried.Body.String())
	}
}

func TestCommerceAssetParentReferencesProtectActive(t *testing.T) {
	s := commerceTestServer(t)
	if _, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input) VALUES('parent-only-task','library-a','processing','{"parentAssetId":"original"}'::jsonb)`); err != nil {
		t.Fatal(err)
	}
	w := libraryHTTP(t, s, "DELETE", "/v1/assets/original", "library-a", "")
	if w.Code != 409 {
		t.Fatal("explicit parent reference was not protected", w.Code, w.Body.String())
	}
}

func TestCommerceAssetProductReferencesSurviveLibraryRemovalAndCleanup(t *testing.T) {
	s := commerceTestServer(t)
	p := createCommerceTestProduct(t, s)
	for _, id := range []string{"original", "style"} {
		w := libraryHTTP(t, s, "DELETE", "/v1/assets/"+id, "library-a", "")
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		var hidden bool
		if err := s.db.QueryRow("SELECT hidden_at IS NOT NULL FROM assets WHERE id=$1", id).Scan(&hidden); err != nil || !hidden {
			t.Fatal("product-only reference was physically removed", id, hidden, err)
		}
	}
	if _, err := s.db.Exec("UPDATE assets SET hidden_at=now()-interval '8 days' WHERE id IN ('original','style')"); err != nil {
		t.Fatal(err)
	}
	if err := s.cleanupHiddenAssets(); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"original", "style"} {
		file, err := s.storage.Open(id + ".png")
		if err != nil {
			t.Fatal("product reference bytes removed by cleanup", id, err)
		}
		file.Close()
	}
	w := libraryHTTP(t, s, "DELETE", "/v1/commerce/products/"+p.ID, "library-a", "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if err := s.cleanupHiddenAssets(); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := s.db.QueryRow("SELECT count(*) FROM assets WHERE id IN ('original','style')").Scan(&remaining); err != nil || remaining != 0 {
		t.Fatal("unreferenced hidden originals were never collected", remaining, err)
	}
}
