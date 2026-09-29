package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func deleteRequest(t *testing.T, s *server, token, path string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodDelete, path, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	if strings.Contains(path, "/assets/") {
		s.assetContent(recorder, request)
	} else {
		s.taskByID(recorder, request)
	}
	return recorder
}

// 历史记录删除：只能删自己的记录，删完列表里不再出现。
func TestDeleteTaskRemovesItFromHistory(t *testing.T) {
	s, token := newTaskListServer(t)

	if recorder := deleteRequest(t, s, token, "/v1/generation/tasks/general-1"); recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	remaining := listTasks(t, s, token, "")
	if len(remaining) != 2 {
		t.Fatalf("expected 2 remaining tasks, got %d", len(remaining))
	}
	for _, item := range remaining {
		if item.ID == "general-1" {
			t.Fatalf("deleted task still listed")
		}
	}

	// 别人的记录删不掉，也不该暴露存在性
	if recorder := deleteRequest(t, s, token, "/v1/generation/tasks/other-1"); recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for another user's task, got %d", recorder.Code)
	}
	// 重复删除返回 404
	if recorder := deleteRequest(t, s, token, "/v1/generation/tasks/general-1"); recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing task, got %d", recorder.Code)
	}
}

// 数据库模式：列表要带错误信息；删除资产会同步从任务结果里移除；删除任务连同其生成图片一起清理。
func TestDatabaseTaskAndAssetDeletion(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()
	if err := migrateDatabase(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	userID := "test-user-" + randomID()
	if _, err := db.Exec("INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3)", userID, userID, "x"); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	defer func() { _, _ = db.Exec("DELETE FROM users WHERE id=$1", userID) }()

	s := &server{db: db, secret: []byte("test-secret")}
	token := s.token(user{ID: userID, Username: userID})

	taskID := "task-" + randomID()
	failure := `第 1 批生成失败：{"status":"failed","statusMessage":"Your prompt was blocked by the content safety policy."}`
	if _, err := db.Exec("INSERT INTO generation_tasks (id,user_id,status,input,error_message,created_at) VALUES ($1,$2,'failed','{}'::jsonb,$3,now())", taskID, userID, failure); err != nil {
		t.Fatalf("insert task: %v", err)
	}
	assetID := "asset-" + randomID()
	assetPath := "/v1/assets/" + assetID + "/content"
	if _, err := db.Exec("INSERT INTO assets (id,user_id,task_id,filename,storage_key,mime,size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7)", assetID, userID, taskID, "generated.png", assetID+".png", "image/png", 12); err != nil {
		t.Fatalf("insert asset: %v", err)
	}
	if _, err := db.Exec("UPDATE generation_tasks SET result_images=$1::jsonb WHERE id=$2", `["`+assetPath+`"]`, taskID); err != nil {
		t.Fatalf("update result images: %v", err)
	}

	tasks := listTasks(t, s, token, "")
	if len(tasks) != 1 || tasks[0].ErrorMessage == "" {
		t.Fatalf("expected the failed task with its error message, got %#v", tasks)
	}

	if recorder := deleteRequest(t, s, token, "/v1/assets/"+assetID); recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting asset, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var raw []byte
	if err := db.QueryRow("SELECT result_images FROM generation_tasks WHERE id=$1", taskID).Scan(&raw); err != nil {
		t.Fatalf("read result images: %v", err)
	}
	var images []string
	_ = json.Unmarshal(raw, &images)
	if len(images) != 0 {
		t.Fatalf("deleted asset should be removed from the task result, got %#v", images)
	}

	if recorder := deleteRequest(t, s, token, "/v1/generation/tasks/"+taskID); recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting task, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM generation_tasks WHERE id=$1", taskID).Scan(&count); err != nil {
		t.Fatalf("count tasks: %v", err)
	}
	if count != 0 {
		t.Fatalf("task should be deleted")
	}
}
