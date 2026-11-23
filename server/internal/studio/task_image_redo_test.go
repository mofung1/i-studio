package studio

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
)

func TestRedoOneCommerceImageReservesOnlyOneCreditCharge(t *testing.T) {
	for _, test := range []struct {
		taskType string
		modules  []string
	}{
		{"product-main", []string{"white", "scene", "detail"}},
		{"detail-page", []string{"hero", "scene", "material"}},
	} {
		t.Run(test.taskType, func(t *testing.T) {
			s, model, _ := operationTestServer(t)
			s.provider = &deliveryTestProvider{}
			s.queue = &taskQueue{server: s, fallback: make(chan string, 4)}
			token := s.testToken(domain.User{ID: "member"})
			other := s.testToken(domain.User{ID: "other"})
			if _, err := s.db.Exec("INSERT INTO projects(id,user_id,name) VALUES('redo-project','member','测试项目')"); err != nil {
				t.Fatal(err)
			}
			if _, err := s.db.Exec(`INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes)
				VALUES('material','member','product.png','material','image/png',8),('foreign','other','unowned.png','foreign','image/png',8)`); err != nil {
				t.Fatal(err)
			}
			input := map[string]any{
				"mode": "commerce", "taskType": test.taskType, "endpointId": model,
				"aspectRatio": "3:4", "resolution": "2K", "productAssetIds": []string{"material"},
				"count": 3, "requirements": strings.Repeat("光", 2000), "outputLanguage": "none",
			}
			seedRedoResults(t, s, "original", "redo-project", input, test.modules, false)

			post := func(credential, endpoint, key, price, body string) *httptest.ResponseRecorder {
				r := httptest.NewRequest(http.MethodPost, endpoint, strings.NewReader(body))
				r.Header.Set("Authorization", "Bearer "+credential)
				r.Header.Set("Idempotency-Key", key)
				r.Header.Set("X-Expected-Unit-Price", price)
				w := httptest.NewRecorder()
				s.router().ServeHTTP(w, r)
				return w
			}
			const endpoint = "/v1/generation/tasks/original/redo-image"
			const body = `{"assetId":"original-c","requirements":"  更近一些  "}`
			for _, denied := range []struct {
				credential string
				price      string
				body       string
				status     int
			}{
				{other, "125", body, http.StatusNotFound},
				{token, "125", `{"assetId":"foreign"}`, http.StatusNotFound},
				{token, "200", body, http.StatusConflict},
			} {
				w := post(denied.credential, endpoint, "one-redo-request", denied.price, denied.body)
				if w.Code != denied.status {
					t.Fatalf("got %d, want %d: %s", w.Code, denied.status, w.Body.String())
				}
			}
			if response := post(token, "/v1/generation/tasks", "foreign-override", "125", `{
				"mode":"commerce","taskType":"product-main","productAssetIds":["material"],"endpointId":"public-model",
				"redoSourceAssetId":"foreign"}`); response.Code != http.StatusBadRequest {
				t.Fatal("ordinary task submission accepted internal redo fields", response.Code)
			}
			var firstTaskID string
			for attempts := 0; attempts < 2; attempts++ {
				w := post(token, endpoint, "one-redo-request", "125", body)
				if w.Code != http.StatusAccepted {
					t.Fatal(w.Code, w.Body.String())
				}
				var response struct{ Task domain.GenerationTask }
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				task := response.Task
				if attempts == 0 {
					firstTaskID = task.ID
				} else if task.ID != firstTaskID {
					t.Fatal("same idempotency key returned a different task")
				}
				newInput := task.Input.(map[string]any)
				if task.ID == "original" || task.ProjectID != "redo-project" || newInput["count"] != float64(1) ||
					newInput["redoSourceTaskId"] != "original" || newInput["redoSourceAssetId"] != "original-c" ||
					newInput["redoInstructions"] != "更近一些" || newInput["requirements"] != input["requirements"] ||
					newInput["endpointId"] != model || newInput["aspectRatio"] != input["aspectRatio"] ||
					!reflect.DeepEqual(newInput["moduleCounts"], map[string]any{test.modules[2]: float64(1)}) {
					t.Fatalf("incorrect derived task: %+v", task)
				}
			}
			original, exists, err := repository.TaskByID(s.db, "original", "member")
			if err != nil || !exists || len(original.ResultImages) != 3 || original.Status != "succeeded" {
				t.Fatalf("original was changed: %+v (%v)", original, err)
			}
			var available, held int
			if err := s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held); err != nil {
				t.Fatal(err)
			}
			if available != 9875 || held != 125 || len(s.queue.fallback) != 1 {
				t.Fatal("expected exactly one queued image and one reservation", available, held, len(s.queue.fallback))
			}
		})
	}
}

func TestRedoClothingSideUsesTheOriginalFrontAcrossVersions(t *testing.T) {
	s, model, _ := operationTestServer(t)
	input := clothingFixture("model", map[string]int{"clothing-model": 2})
	delete(input, "modelAssetId")
	delete(input, "sceneAssetId")
	input["endpointId"] = model
	input["clothingModelSource"] = "generated"
	sets := input["clothingPlan"].([]any)
	sets[0].(map[string]any)["label"] = "正面上身图"
	sets[1].(map[string]any)["label"] = "侧面上身图"
	seedRedoResults(t, s, "clothing-source", "", input, []string{"clothing-model", "clothing-model"}, true)
	load := func(id string) domain.GenerationTask {
		t.Helper()
		task, ok, err := repository.TaskByID(s.db, id, "member")
		if err != nil || !ok {
			t.Fatal(id, err)
		}
		return task
	}
	prepare := func(taskID, assetID, anchor string) map[string]any {
		t.Helper()
		next, err := s.prepareTaskImageRedo(context.Background(), load(taskID), assetID, "")
		if err != nil {
			t.Fatal(err)
		}
		shots := next["clothingPlan"].([]any)
		if len(shots) != 1 || domain.TaskInputField(shots[0], "label") != "侧面上身图" ||
			next["redoModelAssetId"] != anchor || next["redoSourceAssetId"] != assetID ||
			next["redoSourceTaskId"] != taskID {
			t.Fatalf("side view lost its shot or front anchor: %+v", next)
		}
		return next
	}
	next := prepare("clothing-source", "clothing-source-b", "clothing-source-a")
	seedRedoResults(t, s, "side-variant", "", next, []string{"clothing-model"}, true)
	prepare("side-variant", "side-variant-a", "clothing-source-a")

	if _, err := s.db.Exec(`UPDATE generation_tasks SET result_images='["/v1/assets/clothing-source-b/content"]',result_modules='["clothing-model"]' WHERE id='clothing-source'`); err != nil {
		t.Fatal(err)
	}
	_, err := s.prepareTaskImageRedo(context.Background(), load("clothing-source"), "clothing-source-b", "")
	if problem, ok := err.(*operationError); !ok || problem.code != "REDO_MODEL_REFERENCE_UNAVAILABLE" {
		t.Fatalf("cannot pretend the only surviving image is the original front: %v", err)
	}
}

func seedRedoResults(t *testing.T, s *Service, id, projectID string, input map[string]any, modules []string, journal bool) {
	t.Helper()
	images := make([]string, len(modules))
	for index := range modules {
		assetID := id + "-" + string(rune('a'+index))
		images[index] = "/v1/assets/" + assetID + "/content"
		if _, err := s.db.Exec(`INSERT INTO assets (id,user_id,task_id,filename,storage_key,mime,size_bytes)
			VALUES($1,'member',$2,$1,$1,'image/png',8)`, assetID, id); err != nil {
			t.Fatal(err)
		}
	}
	rawInput, _ := json.Marshal(input)
	rawImages, _ := json.Marshal(images)
	rawModules, _ := json.Marshal(modules)
	if _, err := s.db.Exec(`INSERT INTO generation_tasks (id,user_id,project_id,status,input,result_images,result_modules)
		VALUES($1,'member',NULLIF($2,''),'succeeded',$3,$4,$5)`, id, projectID, rawInput, rawImages, rawModules); err != nil {
		t.Fatal(err)
	}
	if journal {
		for index, module := range modules {
			assetID := assetIDFromPath(images[index])
			if _, err := s.db.Exec(`INSERT INTO generation_deliveries(task_id,position,request_key,module_key,status,asset_id)
				VALUES($1,$2,$3,$4,'saved',$3)`, id, index+1, assetID, module); err != nil {
				t.Fatal(err)
			}
		}
	}
}
