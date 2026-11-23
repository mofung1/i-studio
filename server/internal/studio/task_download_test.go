package studio

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

func TestTaskDownloadNamesCommerceSuites(t *testing.T) {
	const browserOrigin = "https://studio.example"
	t.Setenv("WEB_ORIGINS", browserOrigin)
	s := testLibraryServer(t)
	router := s.router()
	image := siteLogoBytes(t, "png")
	for _, suite := range []struct {
		taskType string
		filename string
		modules  []string
		labels   []string
	}{
		{"product-main", "商品上架套图.zip", []string{"white", "scene", "detail"}, []string{"白底主图", "场景主图", "细节主图"}},
		{"detail-page", "商品详情套图.zip", []string{"hero", "material", "scene"}, []string{"首屏主视觉", "材质纹理图", "场景应用图"}},
		{"clothing-set", "模特上身套图.zip", []string{"clothing-model", "clothing-model"}, []string{"正面上身图", "侧面上身图"}},
	} {
		t.Run(suite.taskType, func(t *testing.T) {
			input := map[string]any{"taskType": suite.taskType, "count": len(suite.modules)}
			generatedModel := suite.taskType == "clothing-set"
			if generatedModel {
				input["clothingModelSource"] = "generated"
				input["clothingPlan"] = []clothingShot{
					{ModuleKey: "clothing-model", Label: "正面上身图"},
					{ModuleKey: "clothing-model", Label: "../侧面上身图"},
				}
			}
			rawInput, _ := json.Marshal(input)
			paths := make([]string, len(suite.modules))
			for i := range suite.modules {
				paths[i] = fmt.Sprintf("/v1/assets/%s-%d/content", suite.taskType, i+1)
			}
			rawPaths, _ := json.Marshal(paths)
			rawModules, _ := json.Marshal(suite.modules)
			if _, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input,result_images,result_modules)
				VALUES($1,'library-a','succeeded',$2,$3,$4)`, suite.taskType, rawInput, rawPaths, rawModules); err != nil {
				t.Fatal(err)
			}
			expected := make([]string, len(suite.labels))
			for i, module := range suite.modules {
				id := assetIDFromPath(paths[i])
				if _, err := s.db.Exec(`INSERT INTO assets(id,user_id,task_id,filename,storage_key,mime,size_bytes)
					VALUES($1,'library-a',$2,$1,$1,'image/png',$3)`, id, suite.taskType, len(image)); err != nil {
					t.Fatal(err)
				}
				if err := s.storage.Save(id, bytes.NewReader(image)); err != nil {
					t.Fatal(err)
				}
				if generatedModel {
					if _, err := s.db.Exec(`INSERT INTO generation_deliveries(task_id,position,request_key,module_key,status,asset_id)
						VALUES($1,$2,$3,$4,'saved',$3)`, suite.taskType, i+1, id, module); err != nil {
						t.Fatal(err)
					}
				}
				expected[i] = fmt.Sprintf("%02d_%s.png", i+1, suite.labels[i])
			}
			assertDownload := func(filename string, expected []string) {
				t.Helper()
				path := "/v1/generation/tasks/" + suite.taskType + "/download"
				request := httptest.NewRequest(http.MethodGet, path, nil)
				request.Header.Set("Origin", browserOrigin)
				request.Header.Set("Authorization", "Bearer "+s.testToken(domain.User{ID: "library-a"}))
				w := httptest.NewRecorder()
				router.ServeHTTP(w, request)
				if w.Code != http.StatusOK {
					t.Fatal(w.Code, w.Body.String())
				}
				if got := w.Header().Get("Access-Control-Allow-Origin"); got != browserOrigin {
					t.Errorf("allowed origin = %q, want %q", got, browserOrigin)
				}
				exposedHeaders := w.Header().Get("Access-Control-Expose-Headers")
				exposed := strings.Split(strings.ReplaceAll(exposedHeaders, " ", ""), ",")
				if !slices.Contains(exposed, "X-Archive-Image-Count") || !slices.Contains(exposed, "X-Archive-Expected-Count") {
					t.Errorf("archive counts are not exposed to the browser: %q", exposedHeaders)
				}
				for header, want := range map[string]int{
					"X-Archive-Image-Count":    len(expected),
					"X-Archive-Expected-Count": len(suite.modules),
					"Content-Length":           w.Body.Len(),
				} {
					if got := w.Header().Get(header); got != fmt.Sprint(want) {
						t.Errorf("%s = %q, want %d", header, got, want)
					}
				}
				_, params, err := mime.ParseMediaType(w.Header().Get("Content-Disposition"))
				if err != nil || params["filename"] != filename {
					t.Fatalf("unexpected archive filename: %q (%v)", params["filename"], err)
				}
				archive, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
				if err != nil {
					t.Fatal(err)
				}
				if len(archive.File) != len(expected) {
					t.Fatalf("archive has %d entries, want %d", len(archive.File), len(expected))
				}
				for index, entry := range archive.File {
					if entry.Name != expected[index] {
						t.Errorf("archive entry %d = %q, want %q", index, entry.Name, expected[index])
					}
					data, err := fs.ReadFile(archive, entry.Name)
					if err != nil || !bytes.Equal(data, image) {
						t.Errorf("%s contents were not preserved (%v)", entry.Name, err)
					}
				}
			}
			assertDownload(suite.filename, expected)
			if generatedModel {
				w := libraryHTTP(t, s, http.MethodDelete, "/v1/assets/"+assetIDFromPath(paths[0]), "library-a", "")
				if w.Code != http.StatusOK {
					t.Fatal(w.Code, w.Body.String())
				}
				assertDownload("模特上身套图-缺1张.zip", []string{"01_侧面上身图.png"})
			}
		})
	}
}

type interruptedTaskDownloadStore struct {
	objectstore.Store
	secondImage io.Reader
}

func (s interruptedTaskDownloadStore) Open(key string) (io.ReadCloser, error) {
	if key == "archive-second" {
		return io.NopCloser(s.secondImage), nil
	}
	return s.Store.Open(key)
}

func TestTaskDownloadRejectsInterruptedStorageReads(t *testing.T) {
	s := testLibraryServer(t)
	image := siteLogoBytes(t, "png")
	if _, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input,result_images)
		VALUES('archive-task','library-a','succeeded','{"taskType":"product-main","count":2}',
		'["/v1/assets/archive-first/content","/v1/assets/archive-second/content"]')`); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"archive-first", "archive-second"} {
		if _, err := s.db.Exec(`INSERT INTO assets(id,user_id,task_id,filename,storage_key,mime,size_bytes)
			VALUES($1,'library-a','archive-task',$1,$1,'image/png',$2)`, id, len(image)); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.storage.Save("archive-first", bytes.NewReader(image)); err != nil {
		t.Fatal(err)
	}

	baseStore := s.storage
	truncated := image[:len(image)/2]
	for _, test := range []struct {
		name   string
		reader io.Reader
	}{
		{"read error", io.MultiReader(bytes.NewReader(truncated), iotest.ErrReader(io.ErrUnexpectedEOF))},
		{"silent short read", bytes.NewReader(truncated)},
		{"oversized object", bytes.NewReader(append(bytes.Clone(image), 0))},
	} {
		t.Run(test.name, func(t *testing.T) {
			s.storage = interruptedTaskDownloadStore{Store: baseStore, secondImage: test.reader}
			w := libraryHTTP(t, s, http.MethodGet, "/v1/generation/tasks/archive-task/download", "library-a", "")
			if w.Code != http.StatusInternalServerError || w.Header().Get("Content-Type") != "application/json" {
				t.Fatalf("expected JSON failure, got %d %v", w.Code, w.Header())
			}
			for _, header := range []string{"Content-Disposition", "X-Archive-Image-Count", "X-Archive-Expected-Count"} {
				if w.Header().Get(header) != "" {
					t.Errorf("failed response included archive header %s", header)
				}
			}
			var problem struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &problem); err != nil || problem.Code != "TASK_ARCHIVE_FAILED" {
				t.Fatalf("unexpected error body %q (%v)", w.Body, err)
			}
		})
	}
}
