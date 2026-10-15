package studio

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
)

func readAdminList(t *testing.T, s *Service, token, resource, query string) (adminPagination, []map[string]any) {
	t.Helper()
	w := operationRequest(s, "GET", "/v1/admin/"+resource+query, "", token, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatalf("%s list: %d %s", resource, w.Code, w.Body.String())
	}
	var page adminPagination
	var body map[string]json.RawMessage
	var items []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(body[resource], &items); err != nil {
		t.Fatal(err)
	}
	return page, items
}

func TestAdminListsReadEveryPageBeyondOneHundred(t *testing.T) {
	for _, resource := range []string{"users", "models", "audit"} {
		t.Run(resource, func(t *testing.T) {
			s := &Service{db: isolatedTestDatabase(t), secret: []byte("list-fixture")}
			token := s.testAdminToken(domain.User{ID: "operator"})
			queries := map[string][]string{
				"users": {
					`INSERT INTO users(id,username,password_hash,created_at) SELECT 'customer-'||lpad(n::text,3,'0'),'customer-'||lpad(n::text,3,'0'),'private-hash','2026-10-16T00:00:00Z'::timestamptz FROM generate_series(1,123) n`,
					`INSERT INTO credit_accounts(user_id,available,held) SELECT id,125,25 FROM users`,
				},
				"models": {`INSERT INTO public_models(id,name,endpoint_id,price_minor,created_at) SELECT 'model-'||lpad(n::text,3,'0'),'模型'||n,'channel',125,'2026-10-16T00:00:00Z'::timestamptz FROM generate_series(1,123) n`},
				"audit":  {`INSERT INTO admin_audit(actor_id,action,target_id,detail) SELECT 'operator','fixture.change',n::text,'操作记录'||n FROM generate_series(1,123) n`},
			}
			for _, query := range queries[resource] {
				if _, err := s.db.Exec(query); err != nil {
					t.Fatal(err)
				}
			}
			seen := map[string]bool{}
			for number := 1; number <= 7; number++ {
				page, items := readAdminList(t, s, token, resource, fmt.Sprintf("?page=%d&pageSize=20", number))
				if page.Page != number || page.PageSize != 20 || page.Total != 123 || page.TotalPages != 7 || len(items) != min(20, 123-(number-1)*20) {
					t.Fatalf("bad page: %+v, %d items", page, len(items))
				}
				for i, item := range items {
					id := fmt.Sprint(item["id"])
					if seen[id] {
						t.Fatalf("duplicate across pages: %s", id)
					}
					seen[id] = true
					index := (number-1)*20 + i + 1
					want := fmt.Sprintf("model-%03d", index)
					if resource == "users" {
						want = fmt.Sprintf("customer-%03d", 124-index)
					}
					if resource == "audit" {
						want = fmt.Sprint(124 - index)
					}
					if id != want {
						t.Fatalf("unstable order: %s, want %s", id, want)
					}
					if _, leaked := item["passwordHash"]; leaked {
						t.Fatal("password hash in list")
					}
				}
			}
			page, items := readAdminList(t, s, token, resource, "?page=999999999&pageSize=50")
			if page.Page != 3 || page.TotalPages != 3 || len(items) != 23 {
				t.Fatal("last page was not clamped", page, len(items))
			}
			if resource == "users" {
				page, items = readAdminList(t, s, token, resource, "?q=customer-1&pageSize=50")
				if page.Total != 24 || len(items) != 24 {
					t.Fatal("search count differs from rows", page, len(items))
				}
				page, items = readAdminList(t, s, token, resource, "?q=no-match&page=8")
				if page.Page != 1 || page.Total != 0 || len(items) != 0 {
					t.Fatal("empty search page", page)
				}
			}
		})
	}
}

func TestAdminInspirationSupportsOneHundredAndClampsDeletedPages(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	token := s.testAdminToken(domain.User{ID: "operator"})
	if _, err := s.db.Exec(`INSERT INTO inspiration_prompts(id,title,category,prompt) SELECT 'prompt-'||lpad(n::text,3,'0'),'灵感'||n,'分类','提示词' FROM generate_series(1,123) n`); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		query       string
		page, count int
	}{
		{"?includeDisabled=true&pageSize=100", 1, 100},
		{"?includeDisabled=true&pageSize=100&page=999", 2, 23},
	} {
		w := operationRequest(s, "GET", "/v1/admin/inspiration/prompts"+test.query, "", token, s.router().ServeHTTP)
		var result struct {
			Prompts               []inspirationPromptRow
			Page, PageSize, Total int
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || result.Page != test.page || result.PageSize != 100 || result.Total != 123 || len(result.Prompts) != test.count {
			t.Fatalf("bad inspiration page %d: %+v", w.Code, result)
		}
	}
}

func TestAdministratorChangesAuditLegacyAndAdminRoutesWithoutSecrets(t *testing.T) {
	s, _, _ := operationTestServer(t)
	if err := s.ai.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	token := s.testAdminToken(domain.User{ID: "operator"})
	router := s.router()
	for _, prefix := range []string{"/v1/", "/v1/admin/"} {
		for _, action := range []struct{ method, path, body string }{
			{"POST", "inspiration/categories", fmt.Sprintf(`{"name":%q}`, prefix)},
			{"PUT", "prompt-reverse-settings", `{"timeoutSeconds":180,"imageDetail":"auto","retentionHours":24}`},
			{"PUT", "prompt-templates", `{"key":"rewrite","content":"private-system-template","enabled":true}`},
		} {
			w := operationRequest(s, action.method, prefix+action.path, action.body, token, router.ServeHTTP)
			if w.Code < 200 || w.Code >= 300 {
				t.Fatalf("%s %s: %d %s", action.method, action.path, w.Code, w.Body.String())
			}
		}
	}
	// API keys are accepted by the editor, but never copied into audit details.
	input := testEndpointInput("prompt", "openai_chat")
	input.APIKey = "private-provider-key"
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	w := operationRequest(s, "POST", "/v1/ai-endpoints", string(encoded), token, router.ServeHTTP)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = operationRequest(s, "PUT", "/v1/prompt-templates", `{"key":"rewrite","content":"","enabled":true}`, token, router.ServeHTTP)
	if w.Code != 400 {
		t.Fatal("invalid update accepted", w.Code)
	}
	w = operationRequest(s, "GET", "/v1/admin/audit", "", token, router.ServeHTTP)
	var page struct{ Total int }
	if err = json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if page.Total != 7 {
		t.Fatalf("missing or duplicate successful edits: %d %s", page.Total, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "private-system-template") || strings.Contains(w.Body.String(), "private-provider-key") {
		t.Fatal("configuration secrets were logged")
	}
	if _, err = s.db.Exec("UPDATE admin_users SET password_hash=$1 WHERE id='operator'", authn.HashPassword("Login-fixture-1234")); err != nil {
		t.Fatal(err)
	}
	w = operationRequest(s, "POST", "/v1/admin/auth/login", `{"username":"operator","password":"Login-fixture-1234"}`, "", router.ServeHTTP)
	if w.Code != 200 {
		t.Fatal("admin login", w.Code, w.Body.String())
	}
	var count int
	if err = s.db.QueryRow("SELECT count(*) FROM admin_audit WHERE action='admin.login'").Scan(&count); err != nil || count != 1 {
		t.Fatal("login audit missing", count, err)
	}
}
