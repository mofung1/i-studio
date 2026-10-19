package studio

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func readAdminModel(t *testing.T, s *Service, id string) publicModel {
	t.Helper()
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	m, err := scanPublicModel(tx.QueryRow("SELECT "+publicModelColumns+" FROM public_models WHERE id=$1", id))
	if err != nil {
		t.Fatal(err)
	}
	m.Channels, err = loadModelChannels(tx, id)
	if err != nil {
		t.Fatal(err)
	}
	return m
}
func saveAdminModel(s *Service, m publicModel) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(m)
	method, path := "PUT", "/v1/admin/models/"+m.ID
	if m.ID == "" {
		method, path = "POST", "/v1/admin/models"
	}
	return operationRequest(s, method, path, string(raw), s.testAdminToken(domain.User{ID: "operator"}), s.router().ServeHTTP)
}
func TestModelChannelsManyToManyAndConstraints(t *testing.T) {
	s, id, first := operationTestServer(t)
	second, err := s.ai.save("", testEndpointInput("image", "gemini_native"))
	if err != nil {
		t.Fatal(err)
	}
	m := readAdminModel(t, s, id)
	m.Channels = append(m.Channels, modelChannel{EndpointID: second.ID, UpstreamModelID: "admin-chosen-gemini", Enabled: true})
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	m = readAdminModel(t, s, id)
	if len(m.Channels) != 2 {
		t.Fatal("multiple bindings missing")
	}
	other := m
	other.ID = ""
	other.Name = "第二模型"
	other.IsDefault = false
	other.Version = 0
	if w := saveAdminModel(s, other); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var count int
	if err = s.db.QueryRow("SELECT count(*) FROM public_model_channels WHERE endpoint_id=$1", first).Scan(&count); err != nil || count != 2 {
		t.Fatal("endpoint cannot serve multiple models", count, err)
	}
	duplicated := m
	duplicated.Channels = append(append([]modelChannel{}, m.Channels...), m.Channels[0])
	if w := saveAdminModel(s, duplicated); w.Code != 400 {
		t.Fatal("duplicate accepted", w.Code)
	}
	if _, err = s.db.Exec("INSERT INTO public_model_channels(id,public_model_id,endpoint_id,upstream_model_id) VALUES('duplicate',$1,$2,'x')", id, first); err == nil {
		t.Fatal("missing DB uniqueness")
	}
	if _, err = s.db.Exec("UPDATE public_model_channels SET is_active=true WHERE public_model_id=$1", id); err == nil {
		t.Fatal("multiple active bindings accepted")
	}
	if _, err = s.db.Exec("UPDATE public_model_channels SET enabled=false WHERE public_model_id=$1 AND is_active", id); err == nil {
		t.Fatal("disabled active binding accepted")
	}
}
func TestModelChannelsSwitchRemoveDisableAndOptimisticConcurrency(t *testing.T) {
	s, id, first := operationTestServer(t)
	e, err := s.ai.save("", testEndpointInput("image", "openai_images"))
	if err != nil {
		t.Fatal(err)
	}
	m := readAdminModel(t, s, id)
	m.Channels = append(m.Channels, modelChannel{EndpointID: e.ID, UpstreamModelID: "relay-model", Enabled: true})
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	m = readAdminModel(t, s, id)
	before := m
	m.Channels = append([]modelChannel{}, m.Channels...)
	for i := range m.Channels {
		m.Channels[i].IsActive = m.Channels[i].EndpointID == e.ID
	}
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := saveAdminModel(s, before); w.Code != 409 {
		t.Fatal("stale model save accepted", w.Code)
	}
	m = readAdminModel(t, s, id)
	removed := m
	removed.Channels = nil
	if w := saveAdminModel(s, removed); w.Code != 400 {
		t.Fatal("removed active binding from on-sale model")
	}
	disabled := m
	disabled.Channels = append([]modelChannel{}, m.Channels...)
	for i := range disabled.Channels {
		if disabled.Channels[i].IsActive {
			disabled.Channels[i].Enabled = false
		}
	}
	if w := saveAdminModel(s, disabled); w.Code != 400 {
		t.Fatal("disabled active binding")
	}
	input := testEndpointInput("image", "openai_images")
	input.Enabled = false
	if _, err = s.ai.save(e.ID, input); err == nil {
		t.Fatal("disabled active endpoint")
	}
	if err = s.ai.mutate(e.ID, true); err == nil {
		t.Fatal("deleted bound active endpoint")
	}
	// No implicit selection of the remaining backup after explicit unpublishing.
	m.Enabled = false
	m.IsDefault = false
	m.Channels = nil
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if _, _, err = s.reserveGeneration("member", "no-channel-0001", 125, operationInput(id, 1)); err == nil {
		t.Fatal("generation without primary accepted")
	}
	if err = s.ai.mutate(e.ID, true); err != nil {
		t.Fatal(err)
	}
	_ = first
}
func TestFrozenChannelSwitchRotationAndDisable(t *testing.T) {
	s, id, first := operationTestServer(t)
	s.provider = &dynamicImageProvider{server: s}
	job, _, err := s.reserveGeneration("member", "snapshot-first-01", 125, operationInput(id, 1))
	if err != nil {
		t.Fatal(err)
	}
	var snapshot string
	if err = s.db.QueryRow("SELECT provider_snapshot::text FROM generation_charges WHERE task_id=$1", job.ID).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"sk-private", "encryptedKey", "api_key_encrypted", "apiKey"} {
		if strings.Contains(snapshot, secret) {
			t.Fatal("snapshot contains key material", snapshot)
		}
	}
	second, err := s.ai.save("", testEndpointInput("image", "gemini_native"))
	if err != nil {
		t.Fatal(err)
	}
	m := readAdminModel(t, s, id)
	m.Channels[0].IsActive = false
	m.Channels = append(m.Channels, modelChannel{EndpointID: second.ID, UpstreamModelID: "second-upstream", Enabled: true, IsActive: true})
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	next, _, err := s.reserveGeneration("member", "snapshot-second-1", 125, operationInput(id, 1))
	if err != nil {
		t.Fatal(err)
	}
	input := testEndpointInput("image", "openai_images")
	input.APIKey = "rotated-secret"
	input.BaseURL = "https://new-host.example/v1"
	input.Protocol = "openai_chat"
	if _, err = s.ai.save(first, input); err != nil {
		t.Fatal(err)
	}
	oldInput := operationInput(id, 1)
	if err = s.loadFrozenGeneration(job.ID, oldInput); err != nil {
		t.Fatal(err)
	}
	oldClient := oldInput["protocolClient"].(*imageProtocolTransport)
	if oldClient.apiKey != "rotated-secret" || oldClient.baseURL != "https://endpoint.example/v1" || oldClient.model != "custom/future-model" || oldClient.protocol != "openai_images" {
		t.Fatalf("snapshot or rotation broken: model=%s protocol=%s base=%s", oldClient.model, oldClient.protocol, oldClient.baseURL)
	}
	newInput := operationInput(id, 1)
	if err = s.loadFrozenGeneration(next.ID, newInput); err != nil {
		t.Fatal(err)
	}
	if c := newInput["protocolClient"].(*imageProtocolTransport); c.model != "second-upstream" || c.protocol != "gemini_native" {
		t.Fatal("new task did not use active channel")
	}
	input.Enabled = false
	input.APIKey = ""
	if _, err = s.ai.save(first, input); err != nil {
		t.Fatal(err)
	}
	if err = s.loadFrozenGeneration(job.ID, operationInput(id, 1)); err == nil {
		t.Fatal("disabled frozen channel still executes")
	}
	// Remove the inactive binding and endpoint: old task still fails, never moves.
	m = readAdminModel(t, s, id)
	m.Channels = m.Channels[1:]
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if err = s.ai.mutate(first, true); err != nil {
		t.Fatal(err)
	}
	if err = s.loadFrozenGeneration(job.ID, operationInput(id, 1)); err == nil {
		t.Fatal("deleted frozen endpoint accepted")
	}
}
func TestModelAndEndpointConcurrentEdits(t *testing.T) {
	s, id, endpoint := operationTestServer(t)
	m := readAdminModel(t, s, id)
	var wg sync.WaitGroup
	var success atomic.Int32
	token := s.testAdminToken(domain.User{ID: "operator"})
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			copy := m
			copy.Name = fmt.Sprintf("name-%d", i)
			raw, _ := json.Marshal(copy)
			w := operationRequest(s, "PUT", "/v1/admin/models/"+id, string(raw), token, s.router().ServeHTTP)
			if w.Code == 200 {
				success.Add(1)
			} else if w.Code != 409 {
				t.Errorf("unexpected status %d", w.Code)
			}
		}(i)
	}
	wg.Wait()
	if success.Load() != 1 {
		t.Fatal("concurrent model edits lost", success.Load())
	}
	e, err := s.ai.resolve("image", endpoint, "")
	if err != nil {
		t.Fatal(err)
	}
	input := testEndpointInput("image", "openai_images")
	input.UpdatedAt = &e.UpdatedAt
	if _, err = s.ai.save(endpoint, input); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ai.save(endpoint, input); err == nil {
		t.Fatal("stale endpoint update accepted")
	}
}
func TestNoFallbackOnFrozenChannelFailure(t *testing.T) {
	s, id, _ := operationTestServer(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(401)
		fmt.Fprint(w, `{"error":{"message":"invalid API key"}}`)
	}))
	defer upstream.Close()
	s.aiHTTPClient = mockUpstreamClient(upstream)
	s.provider = &dynamicImageProvider{server: s}
	m := readAdminModel(t, s, id)
	backup, err := s.ai.save("", testEndpointInput("image", "openai_images"))
	if err != nil {
		t.Fatal(err)
	}
	m.Channels = append(m.Channels, modelChannel{EndpointID: backup.ID, UpstreamModelID: "backup-model", Enabled: true})
	if w := saveAdminModel(s, m); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	job, _, err := s.reserveGeneration("member", "no-fallback-0001", 125, operationInput(id, 1))
	if err != nil {
		t.Fatal(err)
	}
	q := &taskQueue{server: s}
	q.processTask(job.ID)
	q.processTask(job.ID)
	if calls.Load() != 1 {
		t.Fatal("failed request was submitted again", calls.Load())
	}
	var charged, refund int64
	if err = s.db.QueryRow("SELECT charged,refunded FROM generation_charges WHERE task_id=$1", job.ID).Scan(&charged, &refund); err != nil || charged != 0 || refund != 125 {
		t.Fatal(charged, refund, err)
	}
}
func TestFrozenChannelRequiredForDynamicProvider(t *testing.T) {
	s := testAIStore(t)
	if _, err := (&dynamicImageProvider{server: s}).Submit(context.Background(), map[string]any{"endpointId": "anything"}); err == nil {
		t.Fatal("execution resolved a live channel")
	}
}

func TestUnavailableModelAndParametersDoNotReserveCredits(t *testing.T) {
	s, id, _ := operationTestServer(t)
	if _, err := s.db.Exec(`UPDATE public_models SET capabilities='{"referenceImages":false,"aspectRatios":["1:1"],"resolutions":["1K"]}' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.reserveGeneration("member", "unsupported-0001", 125, operationInput(id, 1)); err == nil {
		t.Fatal("unsupported parameters reserved")
	}
	if _, err := s.db.Exec("UPDATE public_model_channels SET is_active=false WHERE public_model_id=$1", id); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.reserveGeneration("member", "missing-main-001", 125, operationInput(id, 1)); err == nil {
		t.Fatal("no active binding accepted")
	}
	var held int64
	var charges int
	if err := s.db.QueryRow("SELECT held,(SELECT count(*) FROM generation_charges) FROM credit_accounts WHERE user_id='member'").Scan(&held, &charges); err != nil || held != 0 || charges != 0 {
		t.Fatal("invalid submission changed wallet", held, charges, err)
	}
}
func TestChannelManagementPermissionsAndCostConfirmation(t *testing.T) {
	s, _, endpointID := operationTestServer(t)
	user := s.testToken(domain.User{ID: "member"})
	admin := s.testAdminToken(domain.User{ID: "operator"})
	router := s.router()
	for _, action := range []struct{ method, path string }{
		{"POST", "/v1/admin/models"}, {"PUT", "/v1/admin/models/public-model"}, {"POST", "/v1/admin/ai-endpoints"}, {"PUT", "/v1/admin/ai-endpoints/" + endpointID}, {"DELETE", "/v1/admin/ai-endpoints/" + endpointID}, {"POST", "/v1/admin/ai-endpoints/" + endpointID + "/test"},
	} {
		if w := operationRequest(s, action.method, action.path, `{}`, user, router.ServeHTTP); w.Code != 403 {
			t.Fatal("non-admin mutation accepted", action, w.Code)
		}
	}
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != "GET" || r.URL.Path != "/v1/models" {
			t.Error("connection test generated an image")
		}
		fmt.Fprint(w, `{"data":[{"id":"verified"}]}`)
	}))
	defer upstream.Close()
	s.aiHTTPClient = mockUpstreamClient(upstream)
	path := "/v1/admin/ai-endpoints/" + endpointID + "/test"
	if w := operationRequest(s, "POST", path, `{"mode":"generate"}`, admin, router.ServeHTTP); w.Code != 400 || calls.Load() != 0 {
		t.Fatal("test generated without cost confirmation", w.Code)
	}
	if w := operationRequest(s, "POST", path, `{"mode":"connection"}`, admin, router.ServeHTTP); w.Code != 200 || calls.Load() != 1 || !strings.Contains(w.Body.String(), `"success":true`) {
		t.Fatal("connection test failed", w.Code, w.Body.String())
	}
}

func TestReservationUsesSingleDatabaseConnection(t *testing.T) {
	s, id, _ := operationTestServer(t)
	s.db.SetMaxOpenConns(1)
	if _, err := s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes) VALUES('owned-source','member','a.png','source.png','image/png',1)"); err != nil {
		t.Fatal(err)
	}
	input := operationInput(id, 1)
	input["referenceAssetIds"] = []any{"owned-source"}
	job, _, err := s.reserveGeneration("member", "single-connection-01", 125, input)
	if err != nil || job.ID == "" {
		t.Fatal("reservation with bounded pool failed", err)
	}
}
func TestEndpointAPIPreventsStaleEditsAndKeepsBlankKey(t *testing.T) {
	s, _, id := operationTestServer(t)
	e, err := s.ai.resolve("image", id, "")
	if err != nil {
		t.Fatal(err)
	}
	input := testEndpointInput("image", "openai_images")
	input.APIKey = ""
	input.UpdatedAt = &e.UpdatedAt
	raw, _ := json.Marshal(input)
	token := s.testAdminToken(domain.User{ID: "operator"})
	path := "/v1/admin/ai-endpoints/" + id
	w := operationRequest(s, "PUT", path, string(raw), token, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = operationRequest(s, "PUT", path, string(raw), token, s.router().ServeHTTP); w.Code != 409 {
		t.Fatal("stale API update accepted", w.Code, w.Body.String())
	}
	current, err := s.ai.resolve("image", id, "")
	if err != nil {
		t.Fatal(err)
	}
	key, err := s.ai.decrypt(current)
	if err != nil || key != testEndpointInput("image", "openai_images").APIKey {
		t.Fatal("blank edit changed secret", err)
	}
}
