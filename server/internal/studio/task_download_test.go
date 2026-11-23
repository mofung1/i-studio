package studio

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestTaskDownloadNamesCommerceSuites(t *testing.T) {
	s := testLibraryServer(t)
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
					VALUES($1,'library-a',$2,$1,$1,'image/png',8)`, id, suite.taskType); err != nil {
					t.Fatal(err)
				}
				if err := s.storage.Save(id, strings.NewReader("image-"+id)); err != nil {
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
				w := libraryHTTP(t, s, http.MethodGet, path, "library-a", "")
				if w.Code != http.StatusOK {
					t.Fatal(w.Code, w.Body.String())
				}
				_, params, err := mime.ParseMediaType(w.Header().Get("Content-Disposition"))
				if err != nil || params["filename"] != filename {
					t.Fatalf("unexpected archive filename: %q (%v)", params["filename"], err)
				}
				archive, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
				if err != nil {
					t.Fatal(err)
				}
				var names []string
				for _, entry := range archive.File {
					names = append(names, entry.Name)
				}
				if !reflect.DeepEqual(names, expected) {
					t.Fatalf("archive entries %v, want %v", names, expected)
				}
			}
			assertDownload(suite.filename, expected)
			if generatedModel {
				w := libraryHTTP(t, s, http.MethodDelete, "/v1/assets/"+assetIDFromPath(paths[0]), "library-a", "")
				if w.Code != http.StatusOK {
					t.Fatal(w.Code, w.Body.String())
				}
				assertDownload("模特上身套图-已完成图片.zip", []string{"01_侧面上身图.png"})
			}
		})
	}
}
