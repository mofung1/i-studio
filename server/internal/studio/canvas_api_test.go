package studio

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
)

func canvasFixture(t *testing.T) (*Service, string, string) {
	t.Helper()
	s, _, _ := operationTestServer(t)
	member := s.testToken(domain.User{ID: "member"})
	w := operationRequest(s, "POST", "/v1/canvases", `{"name":"画布"}`, member, s.router().ServeHTTP)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var created struct {
		Canvas struct {
			ID string `json:"id"`
		} `json:"canvas"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Canvas.ID == "" {
		t.Fatal("canvas create contract changed", w.Body.String(), err)
	}
	return s, member, created.Canvas.ID
}

func TestCanvasListIncludesNodeEdgeCounts(t *testing.T) {
	s, member, id := canvasFixture(t)
	graph := `{"viewport":{"x":0,"y":0,"zoom":1},"graph":{"nodes":[` +
		`{"id":"n1","type":"text","x":0,"y":0,"w":320,"h":160,"data":{},"result":{}},` +
		`{"id":"n2","type":"image","x":400,"y":0,"w":360,"h":260,"data":{},"result":{}},` +
		`{"id":"n3","type":"image","x":800,"y":0,"w":360,"h":260,"data":{},"result":{}}],` +
		`"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]}}`
	if w := operationRequest(s, "PUT", "/v1/canvases/"+id, graph, member, s.router().ServeHTTP); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}

	w := operationRequest(s, "GET", "/v1/canvases", "", member, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var list struct {
		Canvases []struct {
			ID        string `json:"id"`
			NodeCount int    `json:"nodeCount"`
			EdgeCount int    `json:"edgeCount"`
		} `json:"canvases"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	for _, c := range list.Canvases {
		if c.ID == id {
			if c.NodeCount != 3 || c.EdgeCount != 2 {
				t.Fatalf("expected 3 nodes / 2 edges, got %d / %d", c.NodeCount, c.EdgeCount)
			}
			return
		}
	}
	t.Fatal("canvas not in list", w.Body.String())
}

func TestRenameCanvas(t *testing.T) {
	s, member, id := canvasFixture(t)

	if w := operationRequest(s, "PATCH", "/v1/canvases/"+id, `{"name":"新名字"}`, member, s.router().ServeHTTP); w.Code != 200 {
		t.Fatal("rename failed", w.Code, w.Body.String())
	}
	if w := operationRequest(s, "PATCH", "/v1/canvases/"+id, `{"name":"   "}`, member, s.router().ServeHTTP); w.Code != 400 {
		t.Fatal("empty name accepted", w.Code)
	}
	if w := operationRequest(s, "PATCH", "/v1/canvases/"+id, `{"name":"`+strings.Repeat("长", 121)+`"}`, member, s.router().ServeHTTP); w.Code != 400 {
		t.Fatal("overlong name accepted", w.Code)
	}
	if w := operationRequest(s, "PATCH", "/v1/canvases/missing", `{"name":"x"}`, member, s.router().ServeHTTP); w.Code != 404 {
		t.Fatal("missing canvas not 404", w.Code)
	}

	w := operationRequest(s, "GET", "/v1/canvases/"+id, "", member, s.router().ServeHTTP)
	var got struct {
		Canvas struct {
			Name string `json:"name"`
		} `json:"canvas"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Canvas.Name != "新名字" {
		t.Fatalf("rename not persisted: %q", got.Canvas.Name)
	}
}

func TestCancelTaskRefundsFrozenCredits(t *testing.T) {
	s, model, _ := operationTestServer(t)
	member := s.testToken(domain.User{ID: "member"})
	job, _, err := s.reserveGeneration("member", "cancel-fixture", 125, operationInput(model, 2))
	if err != nil {
		t.Fatal(err)
	}

	var available, held int64
	if err := s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held); err != nil {
		t.Fatal(err)
	}
	if available != 10000-250 || held != 250 {
		t.Fatalf("reserve wallet mismatch: available=%d held=%d", available, held)
	}

	if w := operationRequest(s, "POST", "/v1/generation/tasks/"+job.ID+"/cancel", "", member, s.router().ServeHTTP); w.Code != 200 {
		t.Fatal("cancel failed", w.Code, w.Body.String())
	}

	task, ok, err := repository.TaskByID(s.db, job.ID, "member")
	if err != nil || !ok {
		t.Fatal(err)
	}
	if task.Status != "cancelled" {
		t.Fatalf("expected cancelled, got %s", task.Status)
	}
	if err := s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held); err != nil {
		t.Fatal(err)
	}
	if available != 10000 || held != 0 {
		t.Fatalf("cancel refund mismatch: available=%d held=%d", available, held)
	}

	// 幂等：再次取消仍 200，额度不再变化。
	if w := operationRequest(s, "POST", "/v1/generation/tasks/"+job.ID+"/cancel", "", member, s.router().ServeHTTP); w.Code != 200 {
		t.Fatal("idempotent cancel failed", w.Code, w.Body.String())
	}
	if err := s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held); err != nil {
		t.Fatal(err)
	}
	if available != 10000 || held != 0 {
		t.Fatalf("double refund: available=%d held=%d", available, held)
	}

	// 不存在的任务返回 404。
	if w := operationRequest(s, "POST", "/v1/generation/tasks/missing/cancel", "", member, s.router().ServeHTTP); w.Code != 404 {
		t.Fatal("missing task cancel not 404", w.Code)
	}
}
