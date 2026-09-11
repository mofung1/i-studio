package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func dbFindUser(db *sql.DB, username string) (user, bool, error) {
	var u user
	err := db.QueryRow("SELECT id, username, password_hash FROM users WHERE username = $1", username).Scan(&u.ID, &u.Username, &u.PasswordHash)
	if err == sql.ErrNoRows {
		return user{}, false, nil
	}
	return u, err == nil, err
}

func dbInsertUser(db *sql.DB, u user) error {
	_, err := db.Exec("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)", u.ID, u.Username, u.PasswordHash)
	return err
}

func dbInsertTask(db *sql.DB, t task, userID string, input []byte) error {
	_, err := db.Exec("INSERT INTO generation_tasks (id, user_id, project_id, status, input, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", t.ID, userID, nullableString(t.ProjectID), t.Status, input, t.CreatedAt)
	return err
}

func (s *server) userOwnsProject(userID, projectID string) bool {
	if projectID == "" {
		return true
	}
	if s.db == nil {
		return false
	}
	var exists bool
	return s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND user_id=$2)", projectID, userID).Scan(&exists) == nil && exists
}

func (s *server) userOwnsAsset(userID, assetID string) bool {
	if s.db == nil {
		return false
	}
	var exists bool
	return s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM assets WHERE id=$1 AND user_id=$2)", assetID, userID).Scan(&exists) == nil && exists
}

func (s *server) validateInputOwnership(userID string, input map[string]any) error {
	if projectID, _ := input["projectId"].(string); projectID != "" && !s.userOwnsProject(userID, projectID) {
		return fmt.Errorf("所属项目不存在")
	}
	for _, key := range []string{"productAssetIds", "referenceAssetIds"} {
		items, _ := input[key].([]any)
		for _, item := range items {
			assetID, _ := item.(string)
			if !s.userOwnsAsset(userID, assetID) {
				return fmt.Errorf("素材不存在或无权访问")
			}
		}
	}
	return nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func dbFindTask(db *sql.DB, id, userID string) (task, bool, error) {
	var t task
	var input []byte
	var resultRaw []byte
	var errorMessage sql.NullString
	var projectID sql.NullString
	err := db.QueryRow("SELECT id, project_id, status, created_at, input, result_images, error_message FROM generation_tasks WHERE id = $1 AND user_id = $2", id, userID).Scan(&t.ID, &projectID, &t.Status, &t.CreatedAt, &input, &resultRaw, &errorMessage)
	t.ProjectID = projectID.String
	if err == sql.ErrNoRows {
		return task{}, false, nil
	}
	if err != nil {
		return task{}, false, err
	}
	if err := json.Unmarshal(input, &t.Input); err != nil {
		return task{}, false, err
	}
	_ = json.Unmarshal(resultRaw, &t.ResultImages)
	t.ErrorMessage = errorMessage.String
	return t, true, nil
}

func openDatabase() (*sql.DB, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return nil, nil
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func migrateDatabase(db *sql.DB) error {
	if db == nil {
		return nil
	}
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL, filename TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size_bytes BIGINT NOT NULL, width INT NOT NULL DEFAULT 0, height INT NOT NULL DEFAULT 0, hash TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE assets ADD COLUMN IF NOT EXISTS width INT NOT NULL DEFAULT 0; ALTER TABLE assets ADD COLUMN IF NOT EXISTS height INT NOT NULL DEFAULT 0; ALTER TABLE assets ADD COLUMN IF NOT EXISTS hash TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS generation_tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL, status TEXT NOT NULL, input JSONB NOT NULL, result_images JSONB NOT NULL DEFAULT '[]'::jsonb, error_message TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL; ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS result_images JSONB NOT NULL DEFAULT '[]'::jsonb; ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS error_message TEXT NULL;`)
	return err
}

func dbStatus(db *sql.DB) string {
	if db == nil {
		return "not_configured"
	}
	if err := db.Ping(); err != nil {
		return fmt.Sprintf("unavailable: %v", err)
	}
	return "ready"
}
