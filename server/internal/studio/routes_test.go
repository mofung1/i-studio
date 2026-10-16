package studio

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/istudio/server/internal/domain"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

func TestRouterPublicResponsesAndMethodErrors(t *testing.T) {
	router := (&Service{}).router()
	for _, test := range []struct {
		method, path, code string
		status             int
	}{
		{"GET", "/v1/health", "", 200},
		{"GET", "/v1/auth/me", "", 200},
		{"GET", "/v1/operation-settings", "", 200},
		{"POST", "/v1/health", "METHOD_NOT_ALLOWED", 405},
		{"GET", "/v1/missing", "NOT_FOUND", 404},
		{"POST", "/v1/auth/login/", "NOT_FOUND", 404},
		{"POST", "/v1/auth/login", "AUTH_INPUT_INVALID", 400},
	} {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
			if response.Code != test.status || response.Header().Get("Content-Type") != "application/json" || response.Header().Get("Location") != "" {
				t.Fatalf("status=%d, headers=%v, body=%s", response.Code, response.Header(), response.Body.String())
			}
			var body map[string]any
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if test.code != "" && body["code"] != test.code {
				t.Fatalf("unexpected error contract: %v", body)
			}
		})
	}
}

func TestRouterPrivateNestedResourcesRequireAuthentication(t *testing.T) {
	router := (&Service{}).router()
	for _, test := range []struct{ method, path string }{
		{"GET", "/v1/account"}, {"GET", "/v1/generation/tasks"},
		{"GET", "/v1/generation/tasks/task-1"}, {"DELETE", "/v1/generation/tasks/task-1"},
		{"POST", "/v1/generation/tasks/task-1/retry"}, {"GET", "/v1/generation/tasks/task-1/download"},
		{"POST", "/v1/assets"}, {"GET", "/v1/assets/asset-1/content"},
		{"GET", "/v1/assets/asset-1/metadata"}, {"GET", "/v1/assets/asset-1/thumbnail"},
		{"DELETE", "/v1/assets/asset-1"}, {"PATCH", "/v1/projects/project-1"},
		{"PATCH", "/v1/library/assets"}, {"POST", "/v1/library/download"},
		{"GET", "/v1/prompts/reverse"}, {"GET", "/v1/prompts/reverse/capabilities"}, {"GET", "/v1/prompts/reverse/task-1/image"},
		{"POST", "/v1/prompts/reverse/task-1/cancel"},
		{"GET", "/v1/personal/prompts/prompt-1/versions"},
		{"POST", "/v1/personal/prompts/prompt-1/restore"},
		{"PATCH", "/v1/personal/prompts/prompt-1"},
	} {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
			if response.Code != http.StatusUnauthorized || !strings.Contains(response.Body.String(), "AUTH_REQUIRED") {
				t.Fatalf("private resource lost authentication: %d %s", response.Code, response.Body.String())
			}
		})
	}
}

func TestRouterCORSPreflightAndOriginIsolation(t *testing.T) {
	t.Setenv("WEB_ORIGINS", "https://studio.example")
	router := (&Service{}).router()
	for _, origin := range []string{"https://studio.example", "https://other.example"} {
		request := httptest.NewRequest("OPTIONS", "/v1/admin/users/member/balance", nil)
		request.Header.Set("Origin", origin)
		request.Header.Set("Access-Control-Request-Headers", "Authorization, Idempotency-Key, X-Expected-Unit-Price")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
			t.Fatal("preflight reached protected handler", response.Code, response.Body.String())
		}
		if allowed := response.Header().Get("Access-Control-Allow-Origin"); (origin == "https://studio.example" && allowed != origin) || (origin != "https://studio.example" && allowed != "") {
			t.Fatal("origin policy changed", response.Header())
		}
		if !strings.Contains(response.Header().Get("Access-Control-Allow-Headers"), "X-Expected-Unit-Price") {
			t.Fatal("billing headers blocked")
		}
		if !strings.Contains(strings.Join(response.Header().Values("Vary"), ","), "Authorization") {
			t.Fatal("browser image cache is not isolated by bearer token")
		}
	}
}

func TestRouterAdminBoundaryIncludesUnmatchedRoutes(t *testing.T) {
	s := &Service{secret: []byte("test-secret"), users: map[string]domain.User{}}
	member := s.testToken(domain.User{ID: "member", Username: "member"})
	admin := s.testAdminToken(domain.User{ID: "operator", Username: "operator"})
	router := s.router()
	for _, path := range []string{"/v1/admin", "/v1/admin/", "/v1/admin/missing", "/v1/admin/users", "/v1/admin/ai-endpoints/id/test"} {
		for _, test := range []struct {
			token  string
			status int
		}{{"", 401}, {member, 403}, {admin, 503}} {
			response := operationRequest(s, "PATCH", path, "", test.token, router.ServeHTTP)
			if response.Code != test.status || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("%s: expected %d, got %d %s", path, test.status, response.Code, response.Body.String())
			}
		}
	}
}

func TestRouterAdminEditorsPreserveAuditAndLivePermissions(t *testing.T) {
	s, _, _ := operationTestServer(t)
	token := s.testAdminToken(domain.User{ID: "operator"})
	router := s.router()
	path := "/v1/admin/inspiration/categories"
	response := operationRequest(s, "POST", path, `{"name":"路由测试分类"}`, token, router.ServeHTTP)
	if response.Code != 201 {
		t.Fatal(response.Code, response.Body.String())
	}
	var created struct {
		Category inspirationCategoryRow `json:"category"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil || created.Category.ID == "" {
		t.Fatal("category create contract changed", response.Body.String(), err)
	}
	id := created.Category.ID
	response = operationRequest(s, "PUT", path+"/"+id, `{"name":"改名后"}`, token, router.ServeHTTP)
	if response.Code != 200 {
		t.Fatal("admin path parameter not forwarded", response.Code, response.Body.String())
	}
	response = operationRequest(s, "PUT", path+"/"+id, `{"name":""}`, token, router.ServeHTTP)
	if response.Code != 400 {
		t.Fatal("invalid edit accepted", response.Body.String())
	}
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM admin_audit WHERE action IN ('POST inspiration/categories','PUT inspiration/categories')").Scan(&count); err != nil || count != 2 {
		t.Fatal("successful edits must be audited once, failed edits must not be audited", count, err)
	}
	if _, err := s.db.Exec("UPDATE admin_users SET auth_version=auth_version+1 WHERE id='operator'"); err != nil {
		t.Fatal(err)
	}
	if response = operationRequest(s, "GET", path, "", token, router.ServeHTTP); response.Code != 401 {
		t.Fatal("revoked administrator retained access", response.Code)
	}
	token = s.testAdminToken(domain.User{ID: "operator", AuthVersion: 1})
	if _, err := s.db.Exec("UPDATE admin_users SET status='disabled' WHERE id='operator'"); err != nil {
		t.Fatal(err)
	}
	if response = operationRequest(s, "GET", path, "", token, router.ServeHTTP); response.Code != 401 {
		t.Fatal("disabled administrator retained access", response.Code)
	}

}

func TestRouterRecoveryReturnsJSONWithoutPanicDetails(t *testing.T) {
	s := &Service{}
	router := s.router()
	router.GET("/test-panic", func(c *gin.Context) { panic("private upstream details") })
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/test-panic", nil))
	if response.Code != 500 || !strings.Contains(response.Body.String(), "INTERNAL_ERROR") || strings.Contains(response.Body.String(), "private") {
		t.Fatal(response.Code, response.Body.String())
	}
}
