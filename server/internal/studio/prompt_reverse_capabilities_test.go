package studio

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestReverseCapabilitiesKeepFrontendAndAdminConfigurationSeparate(t *testing.T) {
	s, calls := testReverseServer(t, nil)
	if _, err := s.db.Exec(`INSERT INTO prompt_reverse_settings(id,config) VALUES(true,'{"endpointId":"","timeoutSeconds":180,"imageDetail":"high","retentionHours":48}') ON CONFLICT(id) DO UPDATE SET config=EXCLUDED.config`); err != nil {
		t.Fatal(err)
	}
	member := s.testToken(domain.User{ID: "reverse-alice"})
	admin := s.testAdminToken(domain.User{ID: "operator"})
	router := s.router()
	const path = "/v1/prompts/reverse/capabilities"
	for name, token := range map[string]string{"anonymous": "", "admin": admin} {
		if w := operationRequest(s, http.MethodGet, path, "", token, router.ServeHTTP); w.Code != http.StatusUnauthorized {
			t.Fatalf("%s session accepted by frontend endpoint: %d", name, w.Code)
		}
	}
	w := operationRequest(s, http.MethodGet, path, "", member, router.ServeHTTP)
	if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(w.Code, w.Body.String())
	}
	var data map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if len(data) != 3 || data["available"] != true || data["imageDetail"] != "high" || data["reason"] != "" {
		t.Fatal("unexpected public capabilities", data)
	}
	for _, path := range []string{"/v1/prompt-reverse-settings", "/v1/admin/prompt-reverse-settings"} {
		for _, method := range []string{http.MethodGet, http.MethodPut} {
			if w := operationRequest(s, method, path, `{}`, member, router.ServeHTTP); w.Code != http.StatusForbidden {
				t.Fatalf("frontend session accessed operator settings: %s %s: %d", method, path, w.Code)
			}
		}
	}
	if w := operationRequest(s, http.MethodGet, "/v1/admin/prompt-reverse-settings", "", admin, router.ServeHTTP); w.Code != http.StatusOK {
		t.Fatal(w.Code, w.Body.String())
	}
	if calls.Load() != 0 {
		t.Fatal("reading capabilities contacted the AI provider")
	}
}

func TestReverseCapabilitiesReportUnavailableVisionWithoutLeakingProviderDetails(t *testing.T) {
	s, calls := testReverseServer(t, nil)
	if err := s.ai.withConfig(true, func(state *aiConfiguration) error {
		for i := range state.Endpoints {
			state.Endpoints[i].Capabilities["vision"] = false
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	w := reverseHTTP(t, s, http.MethodGet, "/v1/prompts/reverse/capabilities", "reverse-alice", nil, nil)
	var data map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || len(data) != 3 || data["available"] != false || data["reason"] != "图片反推服务暂不可用，请联系网站管理员" {
		t.Fatal(w.Code, data)
	}
	if calls.Load() != 0 {
		t.Fatal("availability check contacted the AI provider")
	}
}
