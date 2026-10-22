package studio

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/database"
	"github.com/istudio/server/internal/domain"
)

func TestPublicInspirationCannotOpenOrSignPrivateObjects(t *testing.T) {
	for _, key := range []string{"@storage/profile/private.png", "@storage/profile/.reverse/job.png", "@storage/profile/.ai/config.json", "@storage/profile/inspiration/../private.png", "../private.png", "inspiration/../../.auth/signing.key", "inspiration\\..\\private.png"} {
		t.Run(key, func(t *testing.T) {
			// A nil store also proves invalid paths never reach object access/signing.
			w := httptest.NewRecorder()
			(&Service{}).inspirationImage(w, httptest.NewRequest("GET", "/v1/inspiration/images/"+key, nil))
			if w.Code != 404 || w.Header().Get("Location") != "" {
				t.Fatalf("private reference accepted: %d", w.Code)
			}
		})
	}
	for _, key := range []string{"case.png", "inspiration/case.jpg", "@storage/profile/inspiration/case.webp"} {
		if _, ok := publicInspirationKey(key); !ok {
			t.Fatalf("public cover rejected: %s", key)
		}
	}
}

type imageRoundTrip func(*http.Request) (*http.Response, error)

func (f imageRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestImageDownloadRejectsInternalNetworksAndRedirects(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "64:ff9b::a00:1", "2002:a00:1::1"} {
		if publicImageAddress(net.ParseIP(ip)) {
			t.Fatal("private IP accepted", ip)
		}
	}
	for _, ip := range []string{"8.8.8.8", "2606:4700:4700::1111"} {
		if !publicImageAddress(net.ParseIP(ip)) {
			t.Fatal("public IP rejected", ip)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if connection, err := dialPublicImage(ctx, "tcp", "127.0.0.1:80"); err == nil {
		connection.Close()
		t.Fatal("loopback connection permitted")
	}
	// Redirects reuse the checked DialContext; check the actual client path too.
	client := newPublicImageClient()
	defer client.CloseIdleConnections()
	if response, err := client.Get("http://127.0.0.1/private.png"); err == nil {
		response.Body.Close()
		t.Fatal("private image download permitted")
	}
	checkedTransport := client.Transport
	client.Transport = imageRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Hostname() == "public.example" {
			return &http.Response{StatusCode: 302, Header: http.Header{"Location": {"http://127.0.0.1/private.png"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
		}
		return checkedTransport.RoundTrip(r)
	})
	if response, err := client.Get("https://public.example/image.png"); err == nil {
		response.Body.Close()
		t.Fatal("redirect bypassed image network policy")
	}
}

func TestUploadAndProviderImagesRejectBrokenHeaders(t *testing.T) {
	s := testLibraryServer(t)
	data := []byte("\x89PNG\r\n\x1a\ninvalid-header")
	w := httptest.NewRecorder()
	s.assets(w, materialRequest(t, s, "library-a", "file", data, nil))
	if w.Code != 400 {
		t.Fatal("corrupt uploaded image accepted", w.Code)
	}
	if _, _, err := validateGeneratedImage(data, "image/png"); err == nil {
		t.Fatal("corrupt generated image could be charged")
	}
}

func TestHealthDoesNotExposeDatabaseErrorsAndFailsReadiness(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t)}
	if err := s.db.Close(); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.health(w, httptest.NewRequest("GET", "/v1/health", nil))
	if w.Code != 503 || strings.Contains(w.Body.String(), "database is closed") {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestGenerationRejectsNullAndOversizedJSON(t *testing.T) {
	s := &Service{}
	for _, body := range []string{"null", `{}`, `{"mode":"general","prompt":"cat"}` + strings.Repeat(" ", 1<<20), `{"mode":"general","prompt":"cat"} {}`} {
		w := httptest.NewRecorder()
		s.router().ServeHTTP(w, httptest.NewRequest("POST", "/v1/generation/validate", strings.NewReader(body)))
		if w.Code != 400 {
			t.Fatalf("invalid body returned %d", w.Code)
		}
	}
}

func loginToken(t *testing.T, s *Service, path, password string) (string, int) {
	t.Helper()
	raw, _ := json.Marshal(map[string]string{"username": "same_name", "password": password})
	w := operationRequest(s, "POST", path, string(raw), "", s.router().ServeHTTP)
	var result struct {
		AccessToken string `json:"accessToken"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	return result.AccessToken, w.Code
}

func TestAdministratorAndCustomerCredentialsAndSessionsAreIsolated(t *testing.T) {
	s := environmentAdminTestServer(t)
	setTestEnvironmentAdmin(t, "same_name", "Administrator-secret-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	if err := registerAccountForTest(t, s, domain.User{ID: "customer", Username: "same_name", PasswordHash: authn.HashPassword("Customer-secret-5678")}, 1000); err != nil {
		t.Fatal(err)
	}
	admin, status := loginToken(t, s, "/v1/admin/auth/login", "Administrator-secret-1234")
	if status != 200 {
		t.Fatal("administrator login", status)
	}
	front, status := loginToken(t, s, "/v1/auth/login", "Customer-secret-5678")
	if status != 200 {
		t.Fatal("customer login", status)
	}
	if _, status := loginToken(t, s, "/v1/auth/login", "Administrator-secret-1234"); status != 401 {
		t.Fatal("admin password accepted by front login", status)
	}
	if _, status := loginToken(t, s, "/v1/admin/auth/login", "Customer-secret-5678"); status != 401 {
		t.Fatal("customer password accepted by admin login", status)
	}
	for _, path := range []string{"/v1/account", "/v1/generation/tasks", "/v1/library/assets", "/v1/personal/prompts"} {
		w := operationRequest(s, "GET", path, "", admin, s.router().ServeHTTP)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("admin accessed customer resource %s: %d", path, w.Code)
		}
	}
	for _, path := range []string{"/v1/admin/users", "/v1/ai-endpoints", "/v1/prompt-templates"} {
		w := operationRequest(s, "GET", path, "", front, s.router().ServeHTTP)
		if w.Code != http.StatusForbidden {
			t.Fatalf("customer accessed admin resource %s: %d", path, w.Code)
		}
	}
	if _, ok := s.currentUser(withToken(admin)); ok {
		t.Fatal("admin token entered web realm")
	}
	if _, ok := s.currentAdministrator(withToken(front)); ok {
		t.Fatal("web token entered admin realm")
	}
}

func TestLegacyAdministratorsSplitOnceWithoutMovingCustomerData(t *testing.T) {
	s := environmentAdminTestServer(t)
	if err := registerAccountForTest(t, s, domain.User{ID: "legacy", Username: "legacy_operator", PasswordHash: authn.HashPassword("Legacy-fixture-1234")}, 500); err != nil {
		t.Fatal(err)
	}
	_, err := s.db.Exec(`UPDATE users SET role='admin' WHERE id='legacy';
 UPDATE operation_settings SET admin_auth_migrated=false;
 CREATE TABLE environment_admin(id BOOLEAN PRIMARY KEY,user_id TEXT REFERENCES users(id));
 INSERT INTO environment_admin VALUES(true,'legacy');
 DELETE FROM schema_file_migrations WHERE name='010_admin_identity.sql'`)
	if err != nil {
		t.Fatal(err)
	}
	oldToken := s.token(domain.User{ID: "legacy", Username: "legacy_operator"})
	if err = database.Migrate(s.db); err != nil {
		t.Fatal(err)
	}
	if err = database.Migrate(s.db); err != nil {
		t.Fatal(err)
	}
	var role string
	var version, balance int64
	var admins, bindings int
	err = s.db.QueryRow(`SELECT role,auth_version,(SELECT available FROM credit_accounts WHERE user_id='legacy'),(SELECT count(*) FROM admin_users),(SELECT count(*) FROM administrator_environment) FROM users WHERE id='legacy'`).Scan(&role, &version, &balance, &admins, &bindings)
	if err != nil || role != "user" || version != 1 || balance != 500 || admins != 1 || bindings != 1 {
		t.Fatal("migration damaged identity or wallet", role, version, balance, admins, bindings, err)
	}
	if _, ok := s.currentUser(withToken(oldToken)); ok {
		t.Fatal("legacy shared session survived migration")
	}
}

func TestExistingTaskErrorsCannotExposePrivateProviderConfiguration(t *testing.T) {
	s, _, _ := operationTestServer(t)
	input := `{"mode":"general","prompt":"cat"}`
	private := "request https://private-provider.example/v1?api_key=fixture-secret failed with model private-model"
	if _, err := s.db.Exec("INSERT INTO generation_tasks(id,user_id,status,input,error_message) VALUES('private-error','member','failed',$1::jsonb,$2)", input, private); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO assets(id,user_id,task_id,filename,storage_key,mime,size_bytes) VALUES('private-asset','member','private-error','test.png','private.png','image/png',20);
 UPDATE generation_tasks SET result_images='["/v1/assets/private-asset/content"]'::jsonb WHERE id='private-error'`); err != nil {
		t.Fatal(err)
	}
	token := s.testToken(domain.User{ID: "member"})
	for _, path := range []string{"/v1/generation/tasks/private-error", "/v1/generation/tasks", "/v1/library/assets"} {
		w := operationRequest(s, "GET", path, "", token, s.router().ServeHTTP)
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		for _, hidden := range []string{"private-provider", "fixture-secret", "private-model"} {
			if strings.Contains(w.Body.String(), hidden) {
				t.Fatal("provider configuration exposed", path)
			}
		}
	}
}
