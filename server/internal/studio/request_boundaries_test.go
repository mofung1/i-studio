package studio

import (
	"net/http"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestCustomerAndAdministratorRequestBoundariesAcrossFeatures(t *testing.T) {
	s, _, _ := operationTestServer(t)
	front := s.testToken(domain.User{ID: "member"})
	admin := s.testAdminToken(domain.User{ID: "operator"})
	router := s.router()
	for _, route := range []struct{ method, path string }{
		{"GET", "/v1/account"}, {"GET", "/v1/generation/quote"},
		{"GET", "/v1/generation/tasks"}, {"POST", "/v1/generation/tasks"},
		{"GET", "/v1/projects"}, {"POST", "/v1/projects"},
		{"GET", "/v1/library/assets"}, {"PATCH", "/v1/library/assets"}, {"POST", "/v1/library/download"},
		{"POST", "/v1/assets"}, {"GET", "/v1/assets/a/content"}, {"GET", "/v1/assets/a/thumbnail"},
		{"GET", "/v1/personal/prompts"}, {"POST", "/v1/personal/prompts"},
		{"GET", "/v1/prompts/reverse/capabilities"}, {"GET", "/v1/prompts/reverse"}, {"POST", "/v1/prompts/reverse"},
		{"POST", "/v1/prompts/enhance"}, {"POST", "/v1/prompts/format"},
		{"POST", "/v1/clothing/plan"}, {"POST", "/v1/clothing/manual-plan"},
	} {
		w := operationRequest(s, route.method, route.path, `{}`, admin, router.ServeHTTP)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("administrator session entered frontend resource %s %s: %d", route.method, route.path, w.Code)
		}
	}
	for _, path := range []string{
		"overview", "models", "users", "settings", "storage", "tasks", "audit",
		"ai-endpoints", "prompt-templates", "prompt-reverse-settings", "site-settings",
		"inspiration/prompts", "inspiration/categories",
	} {
		w := operationRequest(s, "GET", "/v1/admin/"+path, "", front, router.ServeHTTP)
		if w.Code != http.StatusForbidden {
			t.Errorf("customer session entered admin resource %s: %d", path, w.Code)
		}
	}
	for _, route := range []struct{ method, path string }{
		{"GET", "ai-endpoints"}, {"POST", "ai-endpoints"},
		{"GET", "prompt-templates"}, {"PUT", "prompt-templates"},
		{"GET", "prompt-reverse-settings"}, {"PUT", "prompt-reverse-settings"},
		{"PUT", "site-settings"}, {"GET", "inspiration/prompts?includeDisabled=true"},
		{"GET", "inspiration/categories?includeDisabled=true"}, {"POST", "inspiration/categories"},
	} {
		w := operationRequest(s, route.method, "/v1/"+route.path, `{}`, front, router.ServeHTTP)
		if w.Code != http.StatusForbidden {
			t.Errorf("customer session entered legacy admin resource %s %s: %d", route.method, route.path, w.Code)
		}
	}
}
