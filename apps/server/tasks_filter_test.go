package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTaskListServer(t *testing.T) (*server, string) {
	t.Helper()
	s := &server{secret: []byte("test-secret")}
	s.tasks = map[string]task{
		"general-1": {ID: "general-1", UserID: "user-1", Status: "succeeded", CreatedAt: "2026-09-01T00:00:00Z", Input: map[string]any{"mode": "general"}},
		"commerce-1": {ID: "commerce-1", UserID: "user-1", Status: "succeeded", CreatedAt: "2026-09-02T00:00:00Z", Input: map[string]any{"mode": "commerce", "taskType": "product-main"}},
		"detail-1":  {ID: "detail-1", UserID: "user-1", Status: "succeeded", CreatedAt: "2026-09-03T00:00:00Z", Input: map[string]any{"mode": "commerce", "taskType": "detail-page"}},
		"other-1":   {ID: "other-1", UserID: "user-2", Status: "succeeded", CreatedAt: "2026-09-04T00:00:00Z", Input: map[string]any{"mode": "general"}},
	}
	return s, s.token(user{ID: "user-1", Username: "demo"})
}

func listTasks(t *testing.T, s *server, token, query string) []task {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/v1/generation/tasks"+query, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	s.tasksHandler(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Tasks []task `json:"tasks"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return payload.Tasks
}

func TestTaskListSortsNewestFirst(t *testing.T) {
	s, token := newTaskListServer(t)
	tasks := listTasks(t, s, token, "")
	if len(tasks) != 3 {
		t.Fatalf("expected only the caller's 3 tasks, got %d", len(tasks))
	}
	if tasks[0].ID != "detail-1" || tasks[2].ID != "general-1" {
		t.Fatalf("expected newest first ordering, got %#v", []string{tasks[0].ID, tasks[1].ID, tasks[2].ID})
	}
}

func TestTaskListFiltersByModeAndTaskType(t *testing.T) {
	s, token := newTaskListServer(t)

	general := listTasks(t, s, token, "?mode=general")
	if len(general) != 1 || general[0].ID != "general-1" {
		t.Fatalf("expected only general tasks, got %#v", general)
	}

	productMain := listTasks(t, s, token, "?mode=commerce&taskType=product-main")
	if len(productMain) != 1 || productMain[0].ID != "commerce-1" {
		t.Fatalf("expected only product-main tasks, got %#v", productMain)
	}

	commerce := listTasks(t, s, token, "?mode=commerce")
	if len(commerce) != 2 {
		t.Fatalf("expected both commerce tasks, got %d", len(commerce))
	}

	limited := listTasks(t, s, token, "?limit=1")
	if len(limited) != 1 || limited[0].ID != "detail-1" {
		t.Fatalf("expected limit=1 to keep the newest task, got %#v", limited)
	}
}

func TestTaskListRequiresAuth(t *testing.T) {
	s, _ := newTaskListServer(t)
	request := httptest.NewRequest(http.MethodGet, "/v1/generation/tasks", nil)
	recorder := httptest.NewRecorder()
	s.tasksHandler(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", recorder.Code)
	}
}
