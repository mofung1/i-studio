package studio

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
)

func materialPNG(t *testing.T, red uint8) []byte {
	t.Helper()
	var b bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	img.Set(0, 0, color.RGBA{R: red, A: 255})
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func materialRequest(t *testing.T, s *Service, uid, field string, data []byte, fields map[string]string) *http.Request {
	t.Helper()
	var b bytes.Buffer
	writer := multipart.NewWriter(&b)
	if data != nil {
		part, err := writer.CreateFormFile(field, "material.png")
		if err != nil {
			t.Fatal(err)
		}
		_, _ = part.Write(data)
	}
	for key, value := range fields {
		_ = writer.WriteField(key, value)
	}
	_ = writer.Close()
	r := httptest.NewRequest("POST", "/v1/assets", &b)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: uid}))
	return r
}

func uploadMaterial(t *testing.T, s *Service, uid string, data []byte) string {
	t.Helper()
	w := httptest.NewRecorder()
	s.assets(w, materialRequest(t, s, uid, "file", data, nil))
	if w.Code != 200 && w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var response struct {
		Asset struct {
			ID string `json:"id"`
		} `json:"asset"`
	}
	if json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Asset.ID == "" {
		t.Fatal(w.Body.String())
	}
	return response.Asset.ID
}

func TestMaterialUploadsDeduplicatePerAccount(t *testing.T) {
	s := testLibraryServer(t)
	data := materialPNG(t, 50)
	requests := []*http.Request{}
	for i := 0; i < 4; i++ {
		requests = append(requests, materialRequest(t, s, "library-a", "file", data, nil))
	}
	responses := make([]*httptest.ResponseRecorder, len(requests))
	var wg sync.WaitGroup
	for i := range requests {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			responses[i] = httptest.NewRecorder()
			s.assets(responses[i], requests[i])
		}(i)
	}
	wg.Wait()
	id := ""
	for _, w := range responses {
		var response struct {
			Asset struct {
				ID string `json:"id"`
			} `json:"asset"`
		}
		if w.Code != 200 && w.Code != 201 {
			t.Fatal(w.Code, w.Body.String())
		}
		_ = json.Unmarshal(w.Body.Bytes(), &response)
		if id != "" && id != response.Asset.ID {
			t.Fatal("duplicate uploads created multiple assets")
		}
		id = response.Asset.ID
	}
	other := uploadMaterial(t, s, "library-b", data)
	if other == id {
		t.Fatal("dedup crossed accounts")
	}
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM assets").Scan(&count); err != nil || count != 2 {
		t.Fatal(count, err)
	}
	w := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/metadata", "library-b", "")
	if w.Code != 404 {
		t.Fatal("metadata leaked", w.Code)
	}
}

func TestUploadedMaterialUsesDatedUserDirectory(t *testing.T) {
	s := testLibraryServer(t)
	data := materialPNG(t, 75)
	before := time.Now().In(generationStorageLocation).Format("20060102")
	id := uploadMaterial(t, s, "library-a", data)
	after := time.Now().In(generationStorageLocation).Format("20060102")
	var key string
	if err := s.db.QueryRow("SELECT storage_key FROM assets WHERE id=$1", id).Scan(&key); err != nil {
		t.Fatal(err)
	}
	if key != path.Join("user", before, id+".png") && key != path.Join("user", after, id+".png") {
		t.Fatal("unexpected upload storage location", key)
	}
	if got := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/content", "library-a", ""); got.Code != 200 || !bytes.Equal(got.Body.Bytes(), data) {
		t.Fatal("nested upload cannot be read", got.Code)
	}
	if got := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/content", "library-b", ""); got.Code != 404 {
		t.Fatal("nested upload leaked to another account", got.Code)
	}
	if got := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/thumbnail", "library-a", ""); got.Code != 200 {
		t.Fatal("nested thumbnail failed", got.Code)
	}
	var thumbnail string
	if err := s.db.QueryRow("SELECT thumbnail_key FROM assets WHERE id=$1", id).Scan(&thumbnail); err != nil || thumbnail != key+".thumbnail-v1.jpg" {
		t.Fatal("thumbnail moved outside upload directory", thumbnail, err)
	}
}

func TestLegacyAssetLocationsRemainReadable(t *testing.T) {
	s := testLibraryServer(t)
	data := materialPNG(t, 80)
	for _, key := range []string{"legacy-flat.png", "20260919/legacy-generated.png"} {
		t.Run(key, func(t *testing.T) {
			id := "old-" + strings.ReplaceAll(key, "/", "-")
			if err := s.storage.Save(key, bytes.NewReader(data)); err != nil {
				t.Fatal(err)
			}
			if _, err := s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes,width,height) VALUES($1,'library-a','legacy.png',$2,'image/png',$3,16,16)", id, key, len(data)); err != nil {
				t.Fatal(err)
			}
			response := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/content", "library-a", "")
			if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), data) {
				t.Fatal("legacy original unavailable", response.Code)
			}
			if response = libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/thumbnail", "library-a", ""); response.Code != 200 {
				t.Fatal("legacy preview unavailable", response.Code)
			}
		})
	}
}

func TestStoredAndLocalAnalysisSourcesPreserveOrderAndOwnership(t *testing.T) {
	s := testLibraryServer(t)
	owned := uploadMaterial(t, s, "library-a", materialPNG(t, 50))
	foreign := uploadMaterial(t, s, "library-b", materialPNG(t, 100))
	for _, test := range []struct {
		ids   string
		valid bool
	}{{`[{"assetId":"` + owned + `"},{"fileIndex":0}]`, true}, {`[{"assetId":"` + foreign + `"},{"fileIndex":0}]`, false}, {`[{"fileIndex":0},{"fileIndex":0}]`, false}, {`[{"assetId":"` + owned + `","fileIndex":0}]`, false}} {
		r := materialRequest(t, s, "library-a", "images", materialPNG(t, 150), map[string]string{"imagesSources": test.ids})
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatal(err)
		}
		images, _, err := s.readImageSources(r, "images", 4, 5<<20)
		_ = r.MultipartForm.RemoveAll()
		if test.valid {
			if err != nil || len(images) != 2 || images[0].Data == images[1].Data {
				t.Fatal(images, err)
			}
		} else if err == nil {
			t.Fatal("invalid reference accepted", test.ids)
		}
	}
}

func TestDeletingReferencedMaterialProtectsTasksAndHistory(t *testing.T) {
	s := testLibraryServer(t)
	id := uploadMaterial(t, s, "library-a", materialPNG(t, 50))
	if _, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input) VALUES('using-material','library-a','processing',jsonb_build_object('referenceAssetIds',jsonb_build_array($1::text)))`, id); err != nil {
		t.Fatal(err)
	}
	w := libraryHTTP(t, s, "DELETE", "/v1/assets/"+id, "library-a", "")
	if w.Code != 409 {
		t.Fatal("active task source deleted", w.Code, w.Body.String())
	}
	_, _ = s.db.Exec("UPDATE generation_tasks SET status='succeeded' WHERE id='using-material'")
	w = libraryHTTP(t, s, "DELETE", "/v1/assets/"+id, "library-a", "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = libraryHTTP(t, s, "GET", "/v1/library/assets?kind=uploads", "library-a", "")
	if strings.Contains(w.Body.String(), `"id":"`+id+`"`) {
		t.Fatal("hidden source still listed")
	}
	w = libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/content", "library-a", "")
	if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), materialPNG(t, 50)) {
		t.Fatal("historical source lost", w.Code)
	}
}

func TestThumbnailIsPersistedAndReused(t *testing.T) {
	s := testLibraryServer(t)
	id := uploadMaterial(t, s, "library-a", materialPNG(t, 50))
	w := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/thumbnail", "library-a", "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var key, thumbnail string
	if err := s.db.QueryRow("SELECT storage_key,thumbnail_key FROM assets WHERE id=$1", id).Scan(&key, &thumbnail); err != nil || thumbnail == "" {
		t.Fatal(thumbnail, err)
	}
	// Cached previews remain available without opening and decoding the original.
	if err := s.storage.Delete(key); err != nil {
		t.Fatal(err)
	}
	next := libraryHTTP(t, s, "GET", "/v1/assets/"+id+"/thumbnail", "library-a", "")
	if next.Code != 200 || !bytes.Equal(w.Body.Bytes(), next.Body.Bytes()) {
		t.Fatal("thumbnail was regenerated", next.Code)
	}
	file, err := s.storage.Open(thumbnail)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if data, _ := io.ReadAll(file); len(data) == 0 {
		t.Fatal("empty thumbnail")
	}
}

func TestHiddenCleanupKeepsVisibleAndReferencedMaterials(t *testing.T) {
	s := testLibraryServer(t)
	visible := uploadMaterial(t, s, "library-a", materialPNG(t, 10))
	referenced := uploadMaterial(t, s, "library-a", materialPNG(t, 20))
	orphan := uploadMaterial(t, s, "library-a", materialPNG(t, 30))
	_, err := s.db.Exec("UPDATE assets SET hidden_at=now()-interval '8 days' WHERE id IN ($1,$2)", referenced, orphan)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input) VALUES('history-keep','library-a','succeeded',jsonb_build_object('referenceAssetIds',jsonb_build_array($1::text)))`, referenced)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.cleanupHiddenAssets(); err != nil {
		t.Fatal(err)
	}
	if !s.userOwnsAsset("library-a", visible) || !s.userOwnsAsset("library-a", referenced) || s.userOwnsAsset("library-a", orphan) {
		t.Fatal("cleanup removed the wrong materials")
	}
	if err = s.retryStorageDeletions(); err != nil {
		t.Fatal(err)
	}
}
