package studio

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func personalHTTP(t *testing.T, s *Service, method, path, uid, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if uid != "" {
		r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: uid}))
	}
	w := httptest.NewRecorder()
	s.router().ServeHTTP(w, r)
	return w
}

func personalResponse(t *testing.T, w *httptest.ResponseRecorder) personalPrompt {
	t.Helper()
	var data struct {
		Item personalPrompt `json:"item"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if data.Item.ID == "" {
		t.Fatal(w.Code, w.Body.String())
	}
	return data.Item
}

func TestPersonalPromptsPrivateVersionAndRecovery(t *testing.T) {
	s := testLibraryServer(t)
	w := personalHTTP(t, s, "POST", "/v1/personal/prompts", "library-a", `{"kind":"prompt","title":"夏季产品","category":"商品","prompt":"拍摄 {{产品}}，自然光","tags":["摄影"],"favorite":true}`)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	item := personalResponse(t, w)
	if w = personalHTTP(t, s, "GET", "/v1/personal/prompts/"+item.ID, "library-b", ""); w.Code != 404 {
		t.Fatal("private prompt exposed")
	}
	w = personalHTTP(t, s, "GET", "/v1/personal/prompts", "library-b", "")
	if !strings.Contains(w.Body.String(), `"total":0`) || strings.Contains(w.Body.String(), "商品") {
		t.Fatal("private category exposed", w.Body.String())
	}
	update := fmt.Sprintf(`{"kind":"prompt","title":"夏季产品","category":"商品","prompt":"拍摄 {{产品}}，柔和侧光","tags":["摄影"],"version":%d}`, item.Version)
	w = personalHTTP(t, s, "PUT", "/v1/personal/prompts/"+item.ID, "library-a", update)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	updated := personalResponse(t, w)
	if updated.Version != 2 || !updated.Favorite {
		t.Fatal("version or favorite lost")
	}
	if w = personalHTTP(t, s, "PUT", "/v1/personal/prompts/"+item.ID, "library-a", update); w.Code != 409 {
		t.Fatal("stale edit replaced current content")
	}
	if w = personalHTTP(t, s, "GET", "/v1/personal/prompts/"+item.ID+"/versions", "library-b", ""); w.Code != 404 {
		t.Fatal("private version exposed")
	}
	w = personalHTTP(t, s, "GET", "/v1/personal/prompts/"+item.ID+"/versions", "library-a", "")
	var history struct {
		Versions []struct{ Version int } `json:"versions"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &history)
	if len(history.Versions) != 2 {
		t.Fatal(w.Body.String())
	}
	if w = personalHTTP(t, s, "DELETE", "/v1/personal/prompts/"+item.ID, "library-a", ""); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = personalHTTP(t, s, "GET", "/v1/personal/prompts/"+item.ID, "library-a", ""); w.Code != 404 {
		t.Fatal("trashed item applied")
	}
	w = personalHTTP(t, s, "GET", "/v1/personal/prompts?trash=true", "library-a", "")
	if !strings.Contains(w.Body.String(), `"total":1`) {
		t.Fatal(w.Body.String())
	}
	if w = personalHTTP(t, s, "POST", "/v1/personal/prompts/"+item.ID+"/restore", "library-b", ""); w.Code != 404 {
		t.Fatal("cross account restore")
	}
	if w = personalHTTP(t, s, "POST", "/v1/personal/prompts/"+item.ID+"/restore", "library-a", ""); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if restored := personalResponse(t, personalHTTP(t, s, "GET", "/v1/personal/prompts/"+item.ID, "library-a", "")); restored.Version != 2 || restored.Prompt != updated.Prompt {
		t.Fatal("restore lost current version")
	}
	var publicCount int
	_ = s.db.QueryRow("SELECT count(*) FROM inspiration_prompts").Scan(&publicCount)
	if publicCount != 0 {
		t.Fatal("private content was published")
	}
}

func TestPersonalPresetValidationDoesNotRetainAssetsOrSecrets(t *testing.T) {
	s := testLibraryServer(t)
	for _, field := range []string{"apiKey", "referenceAssetIds", "projectId", "clothingPlan"} {
		body := fmt.Sprintf(`{"kind":"preset","title":"Preset","config":{"mode":"general","model":"model","aspectRatio":"1:1","resolution":"2K","count":1,%q:"private"}}`, field)
		if w := personalHTTP(t, s, "POST", "/v1/personal/prompts", "library-a", body); w.Code != 400 {
			t.Fatal("unsupported preset field accepted", field, w.Code)
		}
	}
	for _, config := range []string{
		`{"mode":"general","model":"test-model","aspectRatio":"3:4","resolution":"2K","count":2,"style":"minimal"}`,
		`{"mode":"commerce","taskType":"product-main","model":"test-model","count":2,"moduleMode":"custom","moduleCounts":{"white":2}}`,
		`{"mode":"commerce","taskType":"clothing-set","clothingMode":"product","clothingStyle":"studio","model":"test-model","count":2,"moduleCounts":{"clothing-front":1,"clothing-detail":1}}`,
		`{"mode":"commerce","taskType":"clothing-set","clothingMode":"model","clothingStyle":"natural","model":"test-model","count":1,"moduleCounts":{"clothing-model":1}}`,
	} {
		body := `{"kind":"preset","title":"Preset","prompt":"","config":` + config + `}`
		w := personalHTTP(t, s, "POST", "/v1/personal/prompts", "library-a", body)
		if w.Code != 201 {
			t.Fatal(config, w.Body.String())
		}
		item := personalResponse(t, w)
		for key := range item.Config {
			if _, ok := presetFields[key]; !ok {
				t.Fatal("validation source retained", key)
			}
		}
	}
	w := personalHTTP(t, s, "GET", "/v1/personal/prompts?kind=preset&mode=general", "library-a", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"total":1`) {
		t.Fatal(w.Body.String())
	}

}

func TestPersonalVersionPagination(t *testing.T) {
	s := testLibraryServer(t)
	item := personalResponse(t, personalHTTP(t, s, "POST", "/v1/personal/prompts", "library-a", `{"kind":"prompt","title":"History","prompt":"Original"}`))
	snapshot, _ := json.Marshal(item)
	if _, err := s.db.Exec("INSERT INTO personal_prompt_versions(prompt_id,version,snapshot) SELECT $1,n,jsonb_set($2::jsonb,'{version}',to_jsonb(n)) FROM generate_series(2,70) n", item.ID, snapshot); err != nil {
		t.Fatal(err)
	}
	versions := map[int]bool{}
	before := 0
	for page := 0; page < 3; page++ {
		path := "/v1/personal/prompts/" + item.ID + "/versions"
		if before > 0 {
			path += fmt.Sprintf("?before=%d", before)
		}
		w := personalHTTP(t, s, "GET", path, "library-a", "")
		var result struct {
			Versions []struct{ Version int } `json:"versions"`
			Next     int                     `json:"nextBefore"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
			t.Fatal(w.Body.String())
		}
		for _, v := range result.Versions {
			if versions[v.Version] {
				t.Fatal("duplicate version")
			}
			versions[v.Version] = true
		}
		before = result.Next
		if before == 0 {
			break
		}
	}
	if len(versions) != 70 {
		t.Fatal("missing historical versions", len(versions))
	}
}
