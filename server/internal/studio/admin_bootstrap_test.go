package studio

import (
	"fmt"
	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
	"strings"
	"sync"
	"testing"
)

func environmentAdminTestServer(t *testing.T) *Service {
	t.Helper()
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD", "")
	return &Service{db: isolatedTestDatabase(t), secret: []byte("test-signing-secret")}
}
func setTestEnvironmentAdmin(t *testing.T, name, password string) {
	t.Helper()
	t.Setenv("ADMIN_USERNAME", name)
	t.Setenv("ADMIN_PASSWORD", password)
}
func findEnvironmentTestAdmin(t *testing.T, s *Service, name string) domain.User {
	t.Helper()
	var u domain.User
	if err := s.db.QueryRow("SELECT id,username,password_hash,role,status,auth_version FROM admin_users WHERE username=$1", name).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Status, &u.AuthVersion); err != nil {
		t.Fatal(err)
	}
	return u
}
func TestEnvironmentAdministratorCreatesOnceWithoutWallet(t *testing.T) {
	s := environmentAdminTestServer(t)
	setTestEnvironmentAdmin(t, "Studio_Admin", "Start1")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	first := findEnvironmentTestAdmin(t, s, "studio_admin")
	if !authn.CheckPassword("Start1", first.PasswordHash) {
		t.Fatal("credentials missing")
	}
	login := operationRequest(s, "POST", "/v1/admin/auth/login", `{"username":"studio_admin","password":"Start1"}`, "", s.router().ServeHTTP)
	if login.Code != 200 || !strings.Contains(login.Body.String(), `"accessToken"`) {
		t.Fatal("six-character administrator password could not log in", login.Code)
	}
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	second := findEnvironmentTestAdmin(t, s, "studio_admin")
	if first != second {
		t.Fatal("restart changed credentials")
	}
	var wallets, front, audits int
	if err := s.db.QueryRow("SELECT (SELECT count(*) FROM credit_accounts),(SELECT count(*) FROM users),(SELECT count(*) FROM admin_audit WHERE action='admin.environment.create')").Scan(&wallets, &front, &audits); err != nil || wallets != 0 || front != 0 || audits != 1 {
		t.Fatal(wallets, front, audits, err)
	}
	token := authn.SignForAudience(s.secret, second, "admin")
	response := operationRequest(s, "GET", "/v1/admin/users", "", token, s.router().ServeHTTP)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"users":[]`) {
		t.Fatal(response.Code, response.Body.String())
	}
}
func TestEnvironmentPasswordRotationAndRenameOnlyAffectAdministrator(t *testing.T) {
	s := environmentAdminTestServer(t)
	if err := registerAccountForTest(t, s, domain.User{ID: "front", Username: "operator_one", PasswordHash: authn.HashPassword("Front-fixture-1234")}, 250); err != nil {
		t.Fatal(err)
	}
	front, _, _ := repository.UserByUsername(s.db, "operator_one")
	frontToken := s.token(front)
	setTestEnvironmentAdmin(t, "operator_one", "Initial-fixture-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	initial := findEnvironmentTestAdmin(t, s, "operator_one")
	oldToken := authn.SignForAudience(s.secret, initial, "admin")
	if _, ok := s.currentAdministrator(withToken(oldToken)); !ok {
		t.Fatal("initial session invalid")
	}
	setTestEnvironmentAdmin(t, "operator_renamed", "Next_2")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	rotated := findEnvironmentTestAdmin(t, s, "operator_renamed")
	if rotated.ID != initial.ID || rotated.AuthVersion != initial.AuthVersion+1 || !authn.CheckPassword("Next_2", rotated.PasswordHash) {
		t.Fatal("rotation failed")
	}
	for _, test := range []struct {
		password string
		status   int
	}{
		{"Initial-fixture-1234", 401},
		{"Next_2", 200},
		{"short", 400},
	} {
		login := operationRequest(s, "POST", "/v1/admin/auth/login", fmt.Sprintf(`{"username":"operator_renamed","password":%q}`, test.password), "", s.router().ServeHTTP)
		if login.Code != test.status {
			t.Fatal("administrator login after rotation", login.Code, test.status)
		}
	}
	if _, ok := s.currentAdministrator(withToken(oldToken)); ok {
		t.Fatal("old administrator session survived rotation")
	}
	if _, ok := s.currentUser(withToken(frontToken)); !ok {
		t.Fatal("administrator rotation invalidated front session")
	}
	after, _, _ := repository.UserByUsername(s.db, "operator_one")
	if after.PasswordHash != front.PasswordHash || after.Role != "user" {
		t.Fatal("front credentials modified")
	}
	var balance int64
	if err := s.db.QueryRow("SELECT available FROM credit_accounts WHERE user_id='front'").Scan(&balance); err != nil || balance != 250 {
		t.Fatal("front wallet changed")
	}
}
func TestEnvironmentAdministratorDoesNotOverwriteAnotherAdministrator(t *testing.T) {
	s := environmentAdminTestServer(t)
	s.testAdminToken(domain.User{ID: "other", Username: "other_operator"})
	setTestEnvironmentAdmin(t, "other_operator", "Unrelated-fixture-1234")
	if err := s.syncEnvironmentAdmin(); err == nil || strings.Contains(err.Error(), "Unrelated-fixture") {
		t.Fatal("existing administrator overwritten or secret leaked")
	}
	setTestEnvironmentAdmin(t, "env_operator", "Fixture-secret-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	setTestEnvironmentAdmin(t, "other_operator", "Fixture-secret-1234")
	if err := s.syncEnvironmentAdmin(); err == nil {
		t.Fatal("rename overwrote another administrator")
	}
}
func TestEnvironmentAdministratorReleasePreservesAccount(t *testing.T) {
	s := environmentAdminTestServer(t)
	setTestEnvironmentAdmin(t, "env_operator", "Fixture-secret-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	initial := findEnvironmentTestAdmin(t, s, "env_operator")
	setTestEnvironmentAdmin(t, "", "")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	after := findEnvironmentTestAdmin(t, s, "env_operator")
	if initial != after {
		t.Fatal("release changed identity")
	}
	var bindings int
	s.db.QueryRow("SELECT count(*) FROM administrator_environment").Scan(&bindings)
	if bindings != 0 {
		t.Fatal("binding retained")
	}
}
func TestEnvironmentAdministratorConcurrentStartupIsIdempotent(t *testing.T) {
	s := environmentAdminTestServer(t)
	setTestEnvironmentAdmin(t, "env_operator", "Fixture-secret-1234")
	var wg sync.WaitGroup
	errs := make(chan error, 3)
	for range 3 {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- s.syncEnvironmentAdmin() }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count int
	s.db.QueryRow("SELECT count(*) FROM admin_users").Scan(&count)
	if count != 1 {
		t.Fatal("duplicate administrator")
	}
}
func TestEnvironmentAdministratorConfigValidation(t *testing.T) {
	for index, test := range []struct {
		name, password string
		valid          bool
	}{
		{"", "", true}, {"admin", "", false}, {"", "Long-fixture-1234", false}, {"bad username", "Long-fixture-1234", false}, {"admin", "short", false}, {"admin", "Abc123", true}, {"admin", "Abc123456", true}, {"admin", strings.Repeat("a", 128), true}, {"admin", strings.Repeat("a", 129), false}, {"admin", "      ", false}, {"admin", "Long-fixture-1234\n", false}, {"admin", "Valid-fixture-1234", true},
	} {
		t.Run(fmt.Sprintf("case_%d", index), func(t *testing.T) {
			setTestEnvironmentAdmin(t, test.name, test.password)
			_, err := readEnvironmentAdminConfig()
			if (err == nil) != test.valid {
				t.Fatal("configuration validation mismatch")
			}
			if err != nil && test.password != "" && strings.Contains(err.Error(), test.password) {
				t.Fatal("password included in configuration error")
			}
		})
	}
}
