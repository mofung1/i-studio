package studio

import (
	"encoding/json"
	"testing"

	"github.com/istudio/server/internal/domain"
)

func TestGenerationQuoteGETIsReadOnlyThroughGin(t *testing.T) {
	s, model, _ := operationTestServer(t)
	token := s.testToken(domain.User{ID: "member"})
	router := s.router()
	path := "/v1/generation/quote?modelId=" + model + "&count=2"
	response := operationRequest(s, "GET", path, "", token, router.ServeHTTP)
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	var quote struct {
		UnitPrice int64 `json:"unitPriceMinor"`
		Total     int64 `json:"totalMinor"`
		Available int64 `json:"availableMinor"`
		CanAfford bool  `json:"canAfford"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &quote); err != nil {
		t.Fatal(err)
	}
	if quote.UnitPrice != 125 || quote.Total != 250 || quote.Available != 10000 || !quote.CanAfford {
		t.Fatalf("quote mismatch: %+v", quote)
	}
	var ledger, tasks int
	if err := s.db.QueryRow("SELECT (SELECT count(*) FROM credit_ledger),(SELECT count(*) FROM generation_tasks)").Scan(&ledger, &tasks); err != nil || ledger != 0 || tasks != 0 {
		t.Fatal("quote changed billing or task data", ledger, tasks, err)
	}
	if response = operationRequest(s, "POST", path, "", token, router.ServeHTTP); response.Code != 405 {
		t.Fatal("quote accepted a mutation method", response.Code)
	}
	if response = operationRequest(s, "GET", path, "", "", router.ServeHTTP); response.Code != 401 {
		t.Fatal("quote lost authentication", response.Code)
	}
}
