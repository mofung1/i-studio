package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func operationTestServer(t *testing.T) (*server, string, string) {
	t.Helper()
	s := testAIStore(t)
	s.db = isolatedTestDatabase(t)
	s.testToken(user{ID: "member"})
	s.testAdminToken(user{ID: "operator"})
	e, err := s.ai.save("", testEndpointInput("image", "openai_image"))
	if err != nil {
		t.Fatal(err)
	}
	id := "public-model"
	if _, err = s.db.Exec("INSERT INTO public_models(id,name,endpoint_id,price_minor,enabled,is_default) VALUES($1,'高级绘图',$2,125,true,true)", id, e.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec("UPDATE credit_accounts SET available=10000 WHERE user_id='member'"); err != nil {
		t.Fatal(err)
	}
	return s, id, e.ID
}
func operationInput(model string, count int) map[string]any {
	return map[string]any{"mode": "general", "prompt": "一只猫", "model": model, "endpointId": model, "count": float64(count), "aspectRatio": "1:1", "resolution": "2K"}
}
func operationRequest(s *server, method, path, body, token string, handler http.HandlerFunc) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}
func TestOperationalPermissionsAndPrivateConfiguration(t *testing.T) {
	s, model, endpoint := operationTestServer(t)
	member := s.testToken(user{ID: "member"})
	admin := s.testAdminToken(user{ID: "operator"})
	for _, path := range []string{"overview", "models", "users", "settings", "tasks", "audit", "ai-endpoints", "prompt-templates", "prompt-reverse-settings", "inspiration/prompts?includeDisabled=true", "inspiration/categories?includeDisabled=true"} {
		w := operationRequest(s, "GET", "/v1/admin/"+path, "", member, s.adminHandler)
		if w.Code != 403 {
			t.Fatalf("ordinary user accessed %s: %d", path, w.Code)
		}
	}
	for path, handler := range map[string]http.HandlerFunc{"/v1/ai-endpoints": s.aiEndpoints, "/v1/prompt-templates": s.promptTemplates, "/v1/prompt-reverse-settings": s.promptReverseSettingsHandler} {
		if w := operationRequest(s, "GET", path, "", member, handler); w.Code != 403 {
			t.Fatal(path, w.Code)
		}
	}
	if w := operationRequest(s, "GET", "/v1/admin/models", "", admin, s.adminHandler); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w := operationRequest(s, "GET", "/v1/generation/capabilities", "", member, s.capabilities)
	for _, private := range []string{endpoint, "endpoint.example", "apiKey", "sk-private", "openai_image", "custom/future-model", "clothingPlanDefaults"} {
		if strings.Contains(w.Body.String(), private) {
			t.Fatalf("private configuration leaked %s: %s", private, w.Body.String())
		}
	}
	if !strings.Contains(w.Body.String(), model) || !strings.Contains(w.Body.String(), "125") {
		t.Fatal("public price missing")
	}
	if _, err := s.db.Exec("UPDATE users SET status='disabled' WHERE id='member'"); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.authenticatedUserID(withToken(member)); ok {
		t.Fatal("disabled account token remained valid")
	}
	if w := operationRequest(s, "GET", "/v1/admin/overview", "", admin, s.adminHandler); w.Code != 200 {
		t.Fatal(w.Code)
	}
}
func withToken(token string) *http.Request {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}
func TestConcurrentReservationCannotOverdrawAndIsIdempotent(t *testing.T) {
	s, m, _ := operationTestServer(t)
	s.db.Exec("UPDATE credit_accounts SET available=500 WHERE user_id='member'")
	config := defaultOperationSettings()
	config.MaxConcurrentTasks = 16
	raw, _ := json.Marshal(config)
	s.db.Exec("UPDATE operation_settings SET config=$1::jsonb", raw)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := []task{}
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			t1, fresh, err := s.reserveGeneration("member", fmt.Sprintf("request-%08d", i), 125, operationInput(m, 2))
			if err == nil && fresh {
				mu.Lock()
				success = append(success, t1)
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if len(success) != 2 {
		t.Fatalf("successful debits=%d, want 2", len(success))
	}
	var available, held int64
	s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held)
	if available != 0 || held != 500 {
		t.Fatalf("balances=%d/%d", available, held)
	}
	var key string
	s.db.QueryRow("SELECT request_key FROM generation_charges WHERE task_id=$1", success[0].ID).Scan(&key)
	same, fresh, err := s.reserveGeneration("member", key, 999, operationInput(m, 2))
	if err != nil || fresh || same.ID != success[0].ID {
		t.Fatalf("lost response duplicated reservation: %+v %v %v", same, fresh, err)
	}
	changed := operationInput(m, 2)
	changed["prompt"] = "改了内容"
	if _, _, err = s.reserveGeneration("member", key, 125, changed); err == nil {
		t.Fatal("same key accepted different input")
	}
}
func TestPartialDeliverySettlesOnceAndTaskDeletionRetainsLedger(t *testing.T) {
	s, m, _ := operationTestServer(t)
	job, _, err := s.reserveGeneration("member", "partial-00001", 125, operationInput(m, 3))
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.db.Exec("INSERT INTO assets(id,user_id,task_id,filename,storage_key,mime,size_bytes) VALUES('delivered','member',$1,'a.png','a.png','image/png',100)", job.ID)
	if err != nil {
		t.Fatal(err)
	}
	paths := []string{"/v1/assets/delivered/content", "/v1/assets/foreign/content", "/v1/assets/delivered/content"}
	if err = s.settleGeneration(job.ID, "failed", paths, nil, "部分失败"); err != nil {
		t.Fatal(err)
	}
	if err = s.settleGeneration(job.ID, "succeeded", nil, nil, ""); err != nil {
		t.Fatal(err)
	}
	var a, h, charged, refund int64
	s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&a, &h)
	s.db.QueryRow("SELECT charged,refunded FROM generation_charges WHERE task_id=$1", job.ID).Scan(&charged, &refund)
	if a != 9875 || h != 0 || charged != 125 || refund != 250 {
		t.Fatalf("settlement %d/%d/%d/%d", a, h, charged, refund)
	}
	tx, _ := s.db.Begin()
	if _, err = deleteTaskRecords(tx, "member", job.ID); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	var count int
	s.db.QueryRow("SELECT count(*) FROM credit_ledger WHERE task_id=$1", job.ID).Scan(&count)
	if count != 2 {
		t.Fatal("task deletion erased billing records")
	}
}
func TestFailureRefundAndPriceSnapshot(t *testing.T) {
	s, m, _ := operationTestServer(t)
	if _, _, err := s.reserveGeneration("member", "price-00001", 100, operationInput(m, 1)); err == nil {
		t.Fatal("stale price accepted")
	}
	job, _, err := s.reserveGeneration("member", "price-00002", 125, operationInput(m, 1))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec("UPDATE public_models SET price_minor=999,enabled=false WHERE id=$1", m); err != nil {
		t.Fatal(err)
	}
	s.attachBilling(&job)
	if job.Billing.UnitPrice != 125 {
		t.Fatal("price not frozen")
	}
	input, _ := s.taskInput(job.ID)
	if err = s.loadFrozenGeneration(job.ID, input); err != nil {
		t.Fatal(err)
	}
	if input["model"] != "custom/future-model" || input["generationPrompts"] == nil {
		t.Fatal("provider and prompts snapshot missing")
	}
	if _, _, err = s.reserveGeneration("member", "price-00003", 999, operationInput(m, 1)); err == nil {
		t.Fatal("disabled model accepted")
	}
	if err = s.settleGeneration(job.ID, "failed", nil, nil, "mock failure"); err != nil {
		t.Fatal(err)
	}
	var a, h int64
	s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&a, &h)
	if a != 10000 || h != 0 {
		t.Fatal("failed task not refunded", a, h)
	}
	if s.claimGeneration(job.ID) {
		t.Fatal("completed task reclaimed")
	}
}
func TestAdminCreditAdjustmentIdempotencyAndLastAdministrator(t *testing.T) {
	s, _, _ := operationTestServer(t)
	token := s.testAdminToken(user{ID: "operator"})
	body := `{"deltaMinor":250,"note":"测试发放","requestKey":"grant-00000001"}`
	for i := 0; i < 2; i++ {
		w := operationRequest(s, "POST", "/v1/admin/users/member/balance", body, token, s.adminHandler)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	var a int64
	s.db.QueryRow("SELECT available FROM credit_accounts WHERE user_id='member'").Scan(&a)
	if a != 10250 {
		t.Fatal("adjustment duplicated", a)
	}
	w := operationRequest(s, "POST", "/v1/admin/users/member/balance", strings.Replace(body, "250", "500", 1), token, s.adminHandler)
	if w.Code != 409 {
		t.Fatal("idempotency mismatch allowed")
	}
	w = operationRequest(s, "PUT", "/v1/admin/users/operator", `{"role":"user","status":"active"}`, token, s.adminHandler)
	if w.Code != 409 {
		t.Fatal("last admin removed", w.Code)
	}
}
func TestMigrationAndRegistrationNeverPromoteUsers(t *testing.T) {
	s, _, _ := operationTestServer(t)
	if err := migrateDatabase(s.db); err != nil {
		t.Fatal(err)
	}
	if err := s.registerAccount(user{ID: "new-account", Username: "new_account", PasswordHash: "fixture"}, 250); err != nil {
		t.Fatal(err)
	}
	var role string
	var balance int64
	if err := s.db.QueryRow("SELECT role FROM users WHERE id='new-account'").Scan(&role); err != nil || role != "user" {
		t.Fatal("registration promoted user", role, err)
	}
	s.db.QueryRow("SELECT available FROM credit_accounts WHERE user_id='new-account'").Scan(&balance)
	if balance != 250 {
		t.Fatal(balance)
	}
}

func TestLegacyPresetsMigrateOnceWithoutGrantingFreeModels(t *testing.T) {
	s := testAIStore(t)
	s.db = isolatedTestDatabase(t)
	s.testToken(user{ID: "legacy"})
	e, err := s.ai.save("", testEndpointInput("image", "openai_image"))
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"mode": "general", "model": e.Model, "endpointId": e.ID, "count": 1})
	if _, err = s.db.Exec("INSERT INTO personal_prompts(id,user_id,kind,title,config) VALUES('preset','legacy','preset','原预设',$1::jsonb)", raw); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec("INSERT INTO personal_prompt_versions(prompt_id,version,snapshot) VALUES('preset',1,jsonb_build_object('kind','preset','config',$1::jsonb))", raw); err != nil {
		t.Fatal(err)
	}
	if err = s.initializePublicModels(); err != nil {
		t.Fatal(err)
	}
	if err = s.initializePublicModels(); err != nil {
		t.Fatal(err)
	}
	models, err := s.publicModels(false)
	if err != nil || len(models) != 1 || models[0].Enabled {
		t.Fatal(models, err)
	}
	var id, model, versionID string
	if err = s.db.QueryRow("SELECT config->>'endpointId',config->>'model' FROM personal_prompts WHERE id='preset'").Scan(&id, &model); err != nil {
		t.Fatal(err)
	}
	if err = s.db.QueryRow("SELECT snapshot#>>'{config,endpointId}' FROM personal_prompt_versions WHERE prompt_id='preset'").Scan(&versionID); err != nil {
		t.Fatal(err)
	}
	if id != models[0].ID || versionID != id || model != e.Name {
		t.Fatal("preset migration changed selection", id, model, versionID)
	}
}

func TestAuthSourceNeverTrustsUnconfiguredForwardedHeaders(t *testing.T) {
	t.Setenv("AUTH_TRUSTED_PROXY_CIDRS", "127.0.0.0/8,10.0.0.0/8")
	r := httptest.NewRequest("POST", "/v1/auth/login", nil)
	r.RemoteAddr = "192.0.2.20:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.1")
	if authSourceIP(r) != "192.0.2.20" {
		t.Fatal("untrusted header used")
	}
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("X-Forwarded-For", "198.51.100.10, 10.0.0.5")
	if authSourceIP(r) != "198.51.100.10" {
		t.Fatal("trusted proxy chain ignored")
	}
	r.Header.Set("X-Forwarded-For", "spoofed")
	if authSourceIP(r) != "127.0.0.1" {
		t.Fatal("invalid forwarded IP accepted")
	}
}

func TestHTTPGenerationPipelineReservesSettlesAndNeverSubmitsDuplicate(t *testing.T) {
	for _, failSecond := range []bool{false, true} {
		t.Run(fmt.Sprint(failSecond), func(t *testing.T) {
			s, model, endpointID := operationTestServer(t)
			s.storage = newLocalStorage(s.storageRoot)
			encoded := base64.StdEncoding.EncodeToString(siteLogoBytes(t, "png"))
			var calls atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				number := calls.Add(1)
				if failSecond && number == 2 {
					w.WriteHeader(500)
					fmt.Fprint(w, `{"error":{"message":"mock upstream failure"}}`)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprintf(w, `{"data":[{"b64_json":%q}]}`, encoded)
			}))
			defer upstream.Close()
			e := testEndpointInput("image", "openai_image")
			e.BaseURL = upstream.URL
			if _, err := s.ai.save(endpointID, e); err != nil {
				t.Fatal(err)
			}
			s.provider = &dynamicImageProvider{server: s}
			s.queue = &taskQueue{server: s, fallback: make(chan string, 10)}
			token := s.testToken(user{ID: "member"})
			raw, _ := json.Marshal(operationInput(model, 3))
			post := func() *httptest.ResponseRecorder {
				r := httptest.NewRequest("POST", "/v1/generation/tasks", strings.NewReader(string(raw)))
				r.Header.Set("Authorization", "Bearer "+token)
				r.Header.Set("Idempotency-Key", "pipeline-0001")
				r.Header.Set("X-Expected-Unit-Price", "125")
				w := httptest.NewRecorder()
				s.tasksHandler(w, r)
				return w
			}
			w := post()
			if w.Code != 202 {
				t.Fatal(w.Code, w.Body.String())
			}
			var response struct {
				Task task `json:"task"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if duplicate := post(); duplicate.Code != 202 {
				t.Fatal(duplicate.Body.String())
			}
			if len(s.queue.fallback) != 1 {
				t.Fatal("duplicate task was enqueued")
			}
			id := <-s.queue.fallback
			s.queue.processTask(id)
			s.queue.processTask(id)
			final, ok, err := dbFindTask(s.db, id, "member")
			if err != nil || !ok {
				t.Fatal(err)
			}
			s.attachBilling(&final)
			count := 3
			expectedCalls := int32(3)
			expectedStatus := "succeeded"
			if failSecond {
				count = 1
				expectedCalls = 2
				expectedStatus = "failed"
			}
			if final.Status != expectedStatus || len(final.ResultImages) != count || final.Billing.Charged != int64(count)*125 || final.Billing.Refunded != int64(3-count)*125 || !final.Billing.Settled {
				t.Fatalf("pipeline result: %+v %+v", final, final.Billing)
			}
			if calls.Load() != expectedCalls {
				t.Fatal("unexpected paid submission count", calls.Load())
			}
			account := operationRequest(s, "GET", "/v1/account", "", token, s.accountHandler)
			if account.Code != 200 || !strings.Contains(account.Body.String(), "settlement") {
				t.Fatal(account.Body.String())
			}
		})
	}
}

func TestFullWakeupChannelKeepsDurableTaskAndReservation(t *testing.T) {
	s, m, _ := operationTestServer(t)
	job, _, err := s.reserveGeneration("member", "queued-full-0001", 125, operationInput(m, 1))
	if err != nil {
		t.Fatal(err)
	}
	queue := &taskQueue{server: s, fallback: make(chan string, 1)}
	queue.fallback <- "occupied"
	if !queue.enqueue(job.ID) {
		t.Fatal("durable task reported as lost")
	}
	queue.recoverDatabaseTasks()
	var status string
	var settled bool
	if err = s.db.QueryRow("SELECT t.status,c.settled FROM generation_tasks t JOIN generation_charges c ON c.task_id=t.id WHERE t.id=$1", job.ID).Scan(&status, &settled); err != nil {
		t.Fatal(err)
	}
	if status != "queued" || settled {
		t.Fatal("notification backpressure changed financial state", status, settled)
	}
}
