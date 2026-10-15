package studio

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
)

type adminTaskPageFixture struct {
	Tasks []struct {
		ID        string `json:"id"`
		Reserved  int64  `json:"reserved"`
		Charged   int64  `json:"charged"`
		Refunded  int64  `json:"refunded"`
		ModelName string `json:"modelName"`
	} `json:"tasks"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	Total      int `json:"total"`
	TotalPages int `json:"totalPages"`
}

func readAdminTaskPage(t *testing.T, s *Service, token, query string) adminTaskPageFixture {
	t.Helper()
	w := operationRequest(s, "GET", "/v1/admin/tasks"+query, "", token, s.router().ServeHTTP)
	if w.Code != http.StatusOK {
		t.Fatalf("task list: %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "never-show-private-prompt") {
		t.Fatal("private prompt leaked into operational report")
	}
	var page adminTaskPageFixture
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	return page
}

func TestAdminTasksPaginationIncludesOlderTasksWithStableOrdering(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t), secret: []byte("admin-pagination-fixture")}
	token := s.testAdminToken(domain.User{ID: "operator"})
	member := s.testToken(domain.User{ID: "member"})
	_, err := s.db.Exec(`INSERT INTO generation_tasks(id,user_id,status,input,created_at)
		SELECT 'task-' || lpad(n::text,3,'0'),'member','succeeded','{"prompt":"never-show-private-prompt"}'::jsonb,'2026-10-16T00:00:00Z'::timestamptz FROM generate_series(1,123) n`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.db.Exec(`INSERT INTO generation_charges(task_id,user_id,request_key,input_hash,model_id,model_name,unit_price,quantity,charged,refunded,settled,provider_snapshot,prompts_snapshot)
		VALUES('task-123','member','report-fixture','hash','model','测试模型',125,2,125,125,true,'{}','[]')`)
	if err != nil {
		t.Fatal(err)
	}
	first := readAdminTaskPage(t, s, token, "")
	if first.Page != 1 || first.PageSize != 20 || first.Total != 123 || first.TotalPages != 7 || len(first.Tasks) != 20 {
		t.Fatalf("unexpected first page: %+v", first)
	}
	charge := first.Tasks[0]
	if charge.ID != "task-123" || charge.Reserved != 250 || charge.Charged != 125 || charge.Refunded != 125 || charge.ModelName != "测试模型" {
		t.Fatalf("settlement fields lost: %+v", charge)
	}
	seen := make(map[string]bool)
	for n := 1; n <= first.TotalPages; n++ {
		page := readAdminTaskPage(t, s, token, fmt.Sprintf("?page=%d&pageSize=20", n))
		for i, task := range page.Tasks {
			want := fmt.Sprintf("task-%03d", 123-((n-1)*20+i))
			if seen[task.ID] || task.ID != want {
				t.Fatalf("duplicate or unstable task ordering: %s, want %s", task.ID, want)
			}
			seen[task.ID] = true
		}
	}
	if len(seen) != 123 {
		t.Fatalf("missing old tasks: %d", len(seen))
	}
	for _, test := range []struct {
		query                    string
		page, size, pages, count int
	}{
		{"?page=2&pageSize=50", 2, 50, 3, 50},
		{"?page=999999999&pageSize=50", 3, 50, 3, 23},
		{"?page=-8&pageSize=0", 1, 1, 123, 1},
		{"?page=bad&pageSize=bad", 1, 20, 7, 20},
		{"?page=1&pageSize=999", 1, 100, 2, 100},
	} {
		page := readAdminTaskPage(t, s, token, test.query)
		if page.Page != test.page || page.PageSize != test.size || page.TotalPages != test.pages || len(page.Tasks) != test.count {
			t.Fatalf("pagination bounds %s: %+v", test.query, page)
		}
	}
	if w := operationRequest(s, "GET", "/v1/admin/tasks?page=2&pageSize=20", "", member, s.router().ServeHTTP); w.Code != http.StatusForbidden {
		t.Fatalf("customer accessed paginated report: %d", w.Code)
	}
}

func TestAdminTasksPaginationEmptyList(t *testing.T) {
	s := &Service{db: isolatedTestDatabase(t), secret: []byte("empty-pagination-fixture")}
	token := s.testAdminToken(domain.User{ID: "operator"})
	page := readAdminTaskPage(t, s, token, "?page=99")
	if page.Page != 1 || page.Total != 0 || page.TotalPages != 1 || page.Tasks == nil || len(page.Tasks) != 0 {
		t.Fatalf("unexpected empty page: %+v", page)
	}
}
