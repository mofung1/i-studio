package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func environmentAdminTestServer(t *testing.T) *server {
	t.Helper()
	t.Setenv("ADMIN_USERNAME", "")
	t.Setenv("ADMIN_PASSWORD", "")
	return &server{db: isolatedTestDatabase(t), secret: []byte("test-signing-secret")}
}
func setTestEnvironmentAdmin(t *testing.T, username, password string) {
	t.Helper()
	t.Setenv("ADMIN_USERNAME", username)
	t.Setenv("ADMIN_PASSWORD", password)
}
func findEnvironmentTestUser(t *testing.T, s *server, name string) user {
	t.Helper()
	u, ok, err := dbFindUser(s.db, name)
	if err != nil || !ok {
		t.Fatalf("account %s missing: %v", name, err)
	}
	return u
}
func TestEnvironmentAdministratorCreatesOnceWithoutSignupGift(t *testing.T) {
	s := environmentAdminTestServer(t)
	_, err := s.db.Exec(`UPDATE operation_settings SET config=jsonb_set(config,'{signupGiftMinor}','50000'::jsonb)`)
	if err != nil {
		t.Fatal(err)
	}
	setTestEnvironmentAdmin(t, "Studio_Admin", "Fixture-secret-1234")
	if err = s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	first := findEnvironmentTestUser(t, s, "studio_admin")
	if first.Role != "admin" || first.Status != "active" || !checkPassword("Fixture-secret-1234", first.PasswordHash) || first.PasswordHash == "Fixture-secret-1234" {
		t.Fatal("administrator credentials or role were not stored correctly")
	}
	if err = s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	second := findEnvironmentTestUser(t, s, "studio_admin")
	if second.ID != first.ID || second.PasswordHash != first.PasswordHash || second.AuthVersion != first.AuthVersion {
		t.Fatal("restart recreated administrator or changed credentials")
	}
	var accounts, audits int
	var balance int64
	if err = s.db.QueryRow("SELECT count(*) FROM credit_accounts WHERE user_id=$1", first.ID).Scan(&accounts); err != nil {
		t.Fatal(err)
	}
	if err = s.db.QueryRow("SELECT available FROM credit_accounts WHERE user_id=$1", first.ID).Scan(&balance); err != nil {
		t.Fatal(err)
	}
	if err = s.db.QueryRow("SELECT count(*) FROM admin_audit WHERE actor_id='environment-bootstrap'").Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if accounts != 1 || balance != 0 || audits != 1 {
		t.Fatal("unexpected bootstrap financial/audit state", accounts, balance, audits)
	}
	token := s.token(second)
	response := operationRequest(s, "GET", "/v1/admin/users", "", token, s.adminHandler)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"environmentManaged":true`) {
		t.Fatal("environment-managed account missing from admin users")
	}
	change := operationRequest(s, "PUT", "/v1/admin/users/"+second.ID, `{"role":"user","status":"active"}`, token, s.adminHandler)
	if change.Code != 409 || !strings.Contains(change.Body.String(), "ENVIRONMENT_ADMIN_MANAGED") {
		t.Fatal("environment-managed administrator was demoted", change.Code)
	}
}
func TestEnvironmentPasswordRotationAndRenameInvalidatePriorSessions(t *testing.T) {
	s := environmentAdminTestServer(t)
	setTestEnvironmentAdmin(t, "operator_one", "Initial-fixture-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	initial := findEnvironmentTestUser(t, s, "operator_one")
	oldToken := s.token(initial)
	if _, ok := s.currentUser(withToken(oldToken)); !ok {
		t.Fatal("initial token invalid")
	}
	setTestEnvironmentAdmin(t, "operator_one", "Rotated-fixture-5678")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	rotated := findEnvironmentTestUser(t, s, "operator_one")
	if rotated.ID != initial.ID || rotated.AuthVersion != initial.AuthVersion+1 {
		t.Fatal("password rotation changed account identity or failed to revoke sessions")
	}
	if _, ok := s.currentUser(withToken(oldToken)); ok {
		t.Fatal("old session survived password rotation")
	}
	if checkPassword("Initial-fixture-1234", rotated.PasswordHash) || !checkPassword("Rotated-fixture-5678", rotated.PasswordHash) {
		t.Fatal("password rotation did not replace old hash")
	}
	body, _ := json.Marshal(map[string]string{"username": "operator_one", "password": "Rotated-fixture-5678"})
	if response := operationRequest(s, "POST", "/v1/auth/login", string(body), "", s.login); response.Code != 200 {
		t.Fatal("new administrator credentials cannot log in", response.Code)
	}
	newToken := s.token(rotated)
	setTestEnvironmentAdmin(t, "operator_renamed", "Rotated-fixture-5678")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	renamed := findEnvironmentTestUser(t, s, "operator_renamed")
	if renamed.ID != initial.ID || renamed.PasswordHash != rotated.PasswordHash {
		t.Fatal("renaming changed identity or password")
	}
	if _, ok := s.currentUser(withToken(newToken)); ok {
		t.Fatal("old session survived administrator rename")
	}
	if _, exists, err := dbFindUser(s.db, "operator_one"); err != nil || exists {
		t.Fatal("old username still exists", err)
	}
}
func TestEnvironmentAdministratorNeverOverwritesAnUnrelatedAccount(t *testing.T) {
	s := environmentAdminTestServer(t)
	if err := s.registerAccount(user{ID: "existing", Username: "existing_user", PasswordHash: hashPassword("Original-fixture-1234")}, 250); err != nil {
		t.Fatal(err)
	}
	setTestEnvironmentAdmin(t, "existing_user", "Unrelated-fixture-5678")
	if err := s.syncEnvironmentAdmin(); err == nil || strings.Contains(err.Error(), "Unrelated-fixture-5678") {
		t.Fatal("occupied username not protected, or secret leaked")
	}
	original := findEnvironmentTestUser(t, s, "existing_user")
	if original.Role != "user" || !checkPassword("Original-fixture-1234", original.PasswordHash) {
		t.Fatal("unrelated account was modified")
	}
	// Matching the existing credentials is an explicit operator adoption.
	setTestEnvironmentAdmin(t, "existing_user", "Original-fixture-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	adopted := findEnvironmentTestUser(t, s, "existing_user")
	if adopted.ID != "existing" || adopted.Role != "admin" {
		t.Fatal("verified adoption did not preserve identity")
	}
	var balance int64
	s.db.QueryRow("SELECT available FROM credit_accounts WHERE user_id='existing'").Scan(&balance)
	if balance != 250 {
		t.Fatal("adoption changed balance")
	}
	if err := s.registerAccount(user{ID: "another", Username: "another_user", PasswordHash: hashPassword("Another-fixture-1234")}, 0); err != nil {
		t.Fatal(err)
	}
	setTestEnvironmentAdmin(t, "another_user", "New-fixture-secret-5678")
	if err := s.syncEnvironmentAdmin(); err == nil {
		t.Fatal("bound administrator renamed over another account")
	}
	other := findEnvironmentTestUser(t, s, "another_user")
	if other.Role != "user" || !checkPassword("Another-fixture-1234", other.PasswordHash) {
		t.Fatal("rename modified another account")
	}
}
func TestEnvironmentAdministratorReleasePreservesAccount(t *testing.T) {
	s := environmentAdminTestServer(t)
	setTestEnvironmentAdmin(t, "env_operator", "Fixture-secret-1234")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	initial := findEnvironmentTestUser(t, s, "env_operator")
	setTestEnvironmentAdmin(t, "", "")
	if err := s.syncEnvironmentAdmin(); err != nil {
		t.Fatal(err)
	}
	after := findEnvironmentTestUser(t, s, "env_operator")
	if after.ID != initial.ID || after.Role != "admin" || after.PasswordHash != initial.PasswordHash {
		t.Fatal("release deleted, demoted or reset the account")
	}
	var bindings int
	s.db.QueryRow("SELECT count(*) FROM environment_admin").Scan(&bindings)
	if bindings != 0 {
		t.Fatal("environment binding not released")
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
	s.db.QueryRow("SELECT count(*) FROM users WHERE role='admin'").Scan(&count)
	if count != 1 {
		t.Fatal("concurrent startup created duplicate admins", count)
	}
}
func TestEnvironmentAdministratorConfigValidation(t *testing.T) {
	for index, test := range []struct {
		name, password string
		valid          bool
	}{
		{"", "", true}, {"admin", "", false}, {"", "Long-fixture-1234", false}, {"bad username", "Long-fixture-1234", false}, {"admin", "short", false}, {"admin", "Long-fixture-1234\n", false}, {"admin", "Valid-fixture-1234", true},
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
