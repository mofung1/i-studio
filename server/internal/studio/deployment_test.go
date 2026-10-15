package studio

import (
	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/repository"
	"testing"
)

func TestDeploymentAdministratorIsIndependentAndAudited(t *testing.T) {
	s, _, _ := operationTestServer(t)
	if _, err := s.db.Exec("ALTER TABLE admin_audit ADD CONSTRAINT deployment_test_reject CHECK(action <> 'admin.credentials')"); err != nil {
		t.Fatal(err)
	}
	if err := repository.SetAdministrator(s.db, "member", "fixture-hash"); err == nil {
		t.Fatal("audit failure ignored")
	}
	var n int
	s.db.QueryRow("SELECT count(*) FROM admin_users WHERE username='member'").Scan(&n)
	if n != 0 {
		t.Fatal("partial administrator creation")
	}
	s.db.Exec("ALTER TABLE admin_audit DROP CONSTRAINT deployment_test_reject")
	if err := repository.SetAdministrator(s.db, "member", authn.HashPassword("Admin-fixture-1234")); err != nil {
		t.Fatal(err)
	}
	var role string
	var balance int64
	if err := s.db.QueryRow("SELECT role,(SELECT available FROM credit_accounts WHERE user_id='member') FROM users WHERE id='member'").Scan(&role, &balance); err != nil || role != "user" || balance != 10000 {
		t.Fatal("CLI modified customer", err)
	}
}
