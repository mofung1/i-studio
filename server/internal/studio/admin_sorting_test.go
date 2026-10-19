package studio

import (
	"fmt"
	"net/url"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestAdminSortingAppliesBeforePaginationAndRejectsSQLIdentifiersFromClients(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t), secret: []byte("sort-fixture")}
	token := s.testAdminToken(domain.User{ID: "operator"})
	for _, query := range []string{
		`INSERT INTO users(id,username,password_hash,created_at) SELECT 'customer-'||lpad(n::text,3,'0'),'customer-'||lpad(n::text,3,'0'),'fixture','2026-10-16T00:00:00Z'::timestamptz FROM generate_series(1,123) n`,
		`INSERT INTO credit_accounts(user_id,available,held) SELECT 'customer-'||lpad(n::text,3,'0'),n,0 FROM generate_series(1,123) n`,
		`INSERT INTO public_models(id,name,price_minor,created_at) SELECT 'model-'||lpad(n::text,3,'0'),'模型'||n,n,'2026-10-16T00:00:00Z'::timestamptz FROM generate_series(1,123) n`,
		`INSERT INTO generation_tasks(id,user_id,status,input,created_at) SELECT 'task-'||lpad(n::text,3,'0'),'customer-001','succeeded','{}','2026-10-16T00:00:00Z'::timestamptz+make_interval(secs=>n) FROM generate_series(1,123) n`,
		`INSERT INTO admin_audit(actor_id,action,created_at) SELECT 'operator','fixture','2026-10-16T00:00:00Z'::timestamptz+make_interval(secs=>n) FROM generate_series(1,123) n`,
	} {
		if _, err := s.db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct{ resource, sort, prefix, fallback string }{
		{"users", "available", "customer-", "customer-123"},
		{"models", "priceMinor", "model-", "model-001"},
		{"tasks", "createdAt", "task-", "task-123"},
		{"audit", "createdAt", "", "123"},
	} {
		t.Run(test.resource, func(t *testing.T) {
			for _, direction := range []string{"asc", "desc"} {
				_, items := readAdminList(t, s, token, test.resource, "?page=2&pageSize=20&sort="+test.sort+"&order="+direction)
				index := 21
				if direction == "desc" {
					index = 103
				}
				want := fmt.Sprintf("%s%03d", test.prefix, index)
				if test.prefix == "" {
					want = fmt.Sprint(index)
				}
				if got := fmt.Sprint(items[0]["id"]); got != want {
					t.Fatalf("sort did not apply across pages: %s, want %s", got, want)
				}
			}
			for _, invalid := range []string{
				"sort=" + url.QueryEscape("id; DROP TABLE users;--") + "&order=desc",
				"sort=" + test.sort + "&order=" + url.QueryEscape("asc; SELECT 1"),
			} {
				page, items := readAdminList(t, s, token, test.resource, "?pageSize=1&"+invalid)
				if page.Total != 123 || fmt.Sprint(items[0]["id"]) != test.fallback {
					t.Fatalf("unsafe sort changed query: %+v %v", page, items)
				}
			}
		})
	}
}
