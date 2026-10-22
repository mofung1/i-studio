package studio

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestImageMeasurementsPersistActualPixelsAndSeparateSupplierCosts(t *testing.T) {
	s, _, endpointID := operationTestServer(t)
	admin := s.testAdminToken(domain.User{ID: "operator"})
	member := s.testToken(domain.User{ID: "member"})
	var calls atomic.Int32
	encoded := base64.StdEncoding.EncodeToString(siteLogoBytes(t, "png"))
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var input map[string]any
		if json.NewDecoder(r.Body).Decode(&input) != nil || input["size"] != "1536x2048" {
			t.Error("requested size was not preserved", input["size"])
		}
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}]}`, encoded)
	}))
	defer upstream.Close()
	endpoint := testEndpointInput("image", "openai_images")
	endpoint.BaseURL = "https://mock.example"
	s.aiHTTPClient = mockUpstreamClient(upstream)
	if _, err := s.ai.save(endpointID, endpoint); err != nil {
		t.Fatal(err)
	}
	w := operationRequest(s, "POST", "/v1/admin/ai-endpoints/"+endpointID+"/test", `{"mode":"generate","confirmCost":true,"aspectRatio":"3:4","resolution":"2K"}`, admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		Success     bool             `json:"success"`
		Measurement imageMeasurement `json:"measurement"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	m := result.Measurement
	if !result.Success || !m.Success || m.Width == 0 || m.Height == 0 || m.Width == 1536 || m.Resolution != "2K" || m.ActualCostMicros != nil || m.EstimatedCostMicros != nil {
		t.Fatal("measured output was replaced with the requested size or costs invented", result)
	}
	w = operationRequest(s, "PUT", "/v1/admin/image-measurements/"+m.ID, `{"estimatedCostMicros":100000,"actualCostMicros":90000,"currency":"CNY","costNote":"模拟账单数据"}`, member, s.router().ServeHTTP)
	if w.Code != 403 {
		t.Fatal("front user could edit costs", w.Code)
	}
	w = operationRequest(s, "PUT", "/v1/admin/image-measurements/"+m.ID, `{"estimatedCostMicros":100000,"actualCostMicros":90000,"currency":"CNY","costNote":"模拟账单数据"}`, admin, s.router().ServeHTTP)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"actualCostMicros":90000`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = operationRequest(s, "GET", "/v1/admin/image-measurements?endpointId="+endpointID, "", admin, s.router().ServeHTTP)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"width":`) || strings.Contains(w.Body.String(), "sk-private") || calls.Load() != 1 {
		t.Fatal(w.Code, w.Body.String(), calls.Load())
	}
	var balance, price int64
	s.db.QueryRow("SELECT available FROM credit_accounts WHERE user_id='member'").Scan(&balance)
	s.db.QueryRow("SELECT price_minor FROM public_models WHERE id='public-model'").Scan(&price)
	if balance != 10000 || price != 125 {
		t.Fatal("supplier accounting changed user credits", balance, price)
	}
	w = operationRequest(s, "PUT", "/v1/admin/image-measurements/"+m.ID, `{"actualCostMicros":-1,"currency":"CNY"}`, admin, s.router().ServeHTTP)
	if w.Code != 400 {
		t.Fatal("negative supplier cost accepted", w.Code)
	}
}
