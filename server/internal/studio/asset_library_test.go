package studio

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func testLibraryServer(t *testing.T) *Service {
	t.Helper()
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec("INSERT INTO users(id,username,password_hash) VALUES('library-a','library_a','unused'),('library-b','library_b','unused')"); err != nil {
		t.Fatal(err)
	}
	return s
}

func libraryHTTP(t *testing.T, s *Service, method, path, uid, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if uid != "" {
		r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: uid}))
	}
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.router().ServeHTTP(w, r)
	return w
}

func seedLibrary(t *testing.T, s *Service, count int) {
	t.Helper()
	_, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input,result_images,created_at)
 SELECT 'lt-'||lpad(n::text,3,'0'),'library-a','succeeded','{"mode":"general","prompt":"Product 100% blue","model":"test-model"}'::jsonb,jsonb_build_array('/v1/assets/la-'||lpad(n::text,3,'0')||'/content'),'2026-10-01T12:00:00Z' FROM generate_series(1,$1) n`, count)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.db.Exec(`INSERT INTO assets(id,user_id,task_id,filename,storage_key,mime,size_bytes,width,height,created_at)
 SELECT 'la-'||lpad(n::text,3,'0'),'library-a','lt-'||lpad(n::text,3,'0'),'image.png','library/'||n::text||'.png','image/png',100,800,600,'2026-10-01T12:00:00Z' FROM generate_series(1,$1) n`, count)
	if err != nil {
		t.Fatal(err)
	}
}

func TestLibraryPaginationAndOwnerIsolation(t *testing.T) {
	s := testLibraryServer(t)
	seedLibrary(t, s, 207)
	for _, resource := range []string{"library/assets", "generation/tasks"} {
		cursor := ""
		seen := map[string]bool{}
		for page := 0; page < 8; page++ {
			w := libraryHTTP(t, s, "GET", "/v1/"+resource+"?limit=40&cursor="+cursor, "library-a", "")
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			var result struct {
				Assets []libraryAsset          `json:"assets"`
				Tasks  []domain.GenerationTask `json:"tasks"`
				Next   string                  `json:"nextCursor"`
				Total  int                     `json:"total"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Total != 207 {
				t.Fatal("total", result.Total)
			}
			ids := []string{}
			for _, a := range result.Assets {
				ids = append(ids, a.ID)
			}
			for _, item := range result.Tasks {
				ids = append(ids, item.ID)
			}
			for _, id := range ids {
				if seen[id] {
					t.Fatal("duplicate", id)
				}
				seen[id] = true
			}
			cursor = result.Next
			if cursor == "" {
				break
			}
		}
		if len(seen) != 207 {
			t.Fatalf("%s read %d", resource, len(seen))
		}
	}
	w := libraryHTTP(t, s, "GET", "/v1/library/assets", "library-b", "")
	if !strings.Contains(w.Body.String(), `"total":0`) {
		t.Fatal(w.Body.String())
	}
	w = libraryHTTP(t, s, "GET", "/v1/library/assets?cursor=invalid", "library-a", "")
	if w.Code != 400 {
		t.Fatal("invalid cursor accepted", w.Code)
	}
	w = libraryHTTP(t, s, "GET", "/v1/library/assets?q=100%25", "library-a", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"total":207`) {
		t.Fatal(w.Body.String())
	}
}

func TestLibraryMetadataIsAtomicAndPrivate(t *testing.T) {
	s := testLibraryServer(t)
	seedLibrary(t, s, 2)
	body := `{"ids":["la-001","missing"],"favorite":true}`
	if w := libraryHTTP(t, s, "PATCH", "/v1/library/assets", "library-a", body); w.Code != 404 {
		t.Fatal(w.Code, w.Body.String())
	}
	var favorite bool
	_ = s.db.QueryRow("SELECT favorite FROM assets WHERE id='la-001'").Scan(&favorite)
	if favorite {
		t.Fatal("partial mutation")
	}
	if w := libraryHTTP(t, s, "PATCH", "/v1/library/assets", "library-b", `{"ids":["la-001"],"favorite":true}`); w.Code != 404 {
		t.Fatal("cross-account update", w.Code)
	}
	if w := libraryHTTP(t, s, "PATCH", "/v1/library/assets", "library-a", `{"ids":["la-001"],"favorite":true,"title":"Blue bottle","tags":["产品","产品","夏季"]}`); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w := libraryHTTP(t, s, "GET", "/v1/library/assets?favorite=true&tag=%E4%BA%A7%E5%93%81", "library-a", "")
	if !strings.Contains(w.Body.String(), `"total":1`) || !strings.Contains(w.Body.String(), `"title":"Blue bottle"`) {
		t.Fatal(w.Body.String())
	}
}

func TestLibraryProjectMoveArchiveAndRemoval(t *testing.T) {
	s := testLibraryServer(t)
	seedLibrary(t, s, 1)
	w := libraryHTTP(t, s, "POST", "/v1/projects", "library-a", `{"name":"Summer"}`)
	var result struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	id := result.Project.ID
	if w.Code != 201 || id == "" {
		t.Fatal(w.Body.String())
	}
	if w = libraryHTTP(t, s, "PATCH", "/v1/library/assets", "library-a", fmt.Sprintf(`{"ids":["la-001"],"projectId":%q}`, id)); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if taskPage := libraryHTTP(t, s, "GET", "/v1/generation/tasks?projectId="+id, "library-a", ""); !strings.Contains(taskPage.Body.String(), `"total":1`) {
		t.Fatal(taskPage.Body.String())
	}
	if w = libraryHTTP(t, s, "PATCH", "/v1/projects/"+id, "library-b", `{"name":"Other"}`); w.Code != 404 {
		t.Fatal("cross account project update")
	}
	if w = libraryHTTP(t, s, "PATCH", "/v1/projects/"+id, "library-a", `{"archived":true}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w = libraryHTTP(t, s, "PATCH", "/v1/library/assets", "library-a", fmt.Sprintf(`{"ids":["la-001"],"projectId":%q}`, id)); w.Code != 404 {
		t.Fatal("archived destination accepted")
	}
	if w = libraryHTTP(t, s, "DELETE", "/v1/projects/"+id, "library-a", ""); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var remaining int
	_ = s.db.QueryRow("SELECT count(*) FROM assets WHERE id='la-001' AND project_id IS NULL").Scan(&remaining)
	if remaining != 1 {
		t.Fatal("removing folder deleted image")
	}
}

func TestLibraryThumbnailAndZipUsePrivateAssets(t *testing.T) {
	s := testLibraryServer(t)
	seedLibrary(t, s, 1)
	var data bytes.Buffer
	_ = png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 800, 600)))
	if err := s.storage.Save("library/1.png", bytes.NewReader(data.Bytes())); err != nil {
		t.Fatal(err)
	}
	if w := libraryHTTP(t, s, "GET", "/v1/assets/la-001/thumbnail", "library-b", ""); w.Code != 404 {
		t.Fatal("private thumbnail exposed")
	}
	w := libraryHTTP(t, s, "GET", "/v1/assets/la-001/thumbnail", "library-a", "")
	config, _, err := image.DecodeConfig(w.Body)
	if w.Code != 200 || err != nil || config.Width != 480 || config.Height != 360 {
		t.Fatal(w.Code, config, err)
	}
	if w = libraryHTTP(t, s, "POST", "/v1/library/download", "library-b", `{"ids":["la-001"]}`); w.Code != 404 {
		t.Fatal("private download exposed")
	}
	w = libraryHTTP(t, s, "POST", "/v1/library/download", "library-a", `{"ids":["la-001"]}`)
	archive, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil || len(archive.File) != 1 {
		t.Fatal(w.Code, err)
	}
	if w = libraryHTTP(t, s, http.MethodGet, "/v1/library/assets", "", ""); w.Code != 401 {
		t.Fatal("authentication missing")
	}
}

func TestLibraryMutationPreflightAllowsPatch(t *testing.T) {
	r := httptest.NewRequest(http.MethodOptions, "/v1/library/assets", nil)
	r.Header.Set("Origin", "http://127.0.0.1:33000")
	r.Header.Set("Access-Control-Request-Method", "PATCH")
	w := httptest.NewRecorder()
	(&Service{}).router().ServeHTTP(w, r)
	if !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "PATCH") {
		t.Fatal("metadata updates are blocked by CORS")
	}
}
