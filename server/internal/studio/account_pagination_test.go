package studio

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestAccountLedgerPaginationAndOwnership(t *testing.T) {
	s, _, _ := operationTestServer(t)
	member := s.testToken(domain.User{ID: "member"})
	other := s.testToken(domain.User{ID: "other"})
	for _, user := range []string{"member", "other"} {
		for i := 1; i <= 125; i++ {
			if _, err := s.db.Exec(`INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,request_key,note) VALUES($1,'adjustment',1,0,$2,0,$3,$3)`, user, i, fmt.Sprintf("%s-%03d", user, i)); err != nil {
				t.Fatal(err)
			}
		}
	}
	type response struct {
		Page       int `json:"page"`
		PageSize   int `json:"pageSize"`
		Total      int `json:"total"`
		TotalPages int `json:"totalPages"`
		Available  int `json:"available"`
		Ledger     []struct {
			ID   int64  `json:"id"`
			Note string `json:"note"`
		} `json:"ledger"`
	}
	read := func(query, token string) response {
		t.Helper()
		w := operationRequest(s, "GET", "/v1/account"+query, "", token, s.router().ServeHTTP)
		if w.Code != 200 {
			t.Fatalf("account status %d: %s", w.Code, w.Body.String())
		}
		var result response
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	first := read("", member)
	if first.Page != 1 || first.PageSize != 20 || first.Total != 125 || first.TotalPages != 7 || len(first.Ledger) != 20 || first.Available != 10000 {
		t.Fatalf("incorrect first page: %+v", first)
	}
	seen := map[int64]bool{}
	for page := 1; page <= 7; page++ {
		result := read(fmt.Sprintf("?page=%d&pageSize=20&userId=other", page), member)
		for _, item := range result.Ledger {
			if seen[item.ID] || item.Note[:7] != "member-" {
				t.Fatalf("duplicate or foreign ledger: %+v", item)
			}
			seen[item.ID] = true
		}
	}
	if len(seen) != 125 {
		t.Fatalf("older records are inaccessible: %d", len(seen))
	}
	last := read("?page=999999&pageSize=20", member)
	if last.Page != 7 || len(last.Ledger) != 5 || last.Ledger[4].Note != "member-001" {
		t.Fatalf("incorrect last page: %+v", last)
	}
	large := read("?page=-2&pageSize=99999", member)
	if large.Page != 1 || large.PageSize != 100 || len(large.Ledger) != 100 {
		t.Fatalf("unbounded pagination: %+v", large)
	}
	otherPage := read("?page=2&pageSize=50", other)
	if otherPage.Total != 125 || len(otherPage.Ledger) != 50 || otherPage.Ledger[0].Note != "other-075" {
		t.Fatalf("incorrect owner/page: %+v", otherPage)
	}
	for _, token := range []string{"", s.testAdminToken(domain.User{ID: "operator"})} {
		if w := operationRequest(s, "GET", "/v1/account?page=2", "", token, s.router().ServeHTTP); w.Code != 401 {
			t.Fatalf("account accepted non-customer: %d", w.Code)
		}
	}
	empty := read("?page=8", s.testToken(domain.User{ID: "empty"}))
	if empty.Total != 0 || empty.Page != 1 || empty.TotalPages != 1 || len(empty.Ledger) != 0 {
		t.Fatalf("incorrect empty account: %+v", empty)
	}
}
