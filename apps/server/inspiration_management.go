package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
)

const inspirationPromptColumns = "id,title,category,prompt,source,image_key,image_width,image_height,sort_order,enabled"

type inspirationScanner interface {
	Scan(dest ...any) error
}

func scanInspirationPrompt(scanner inspirationScanner) (inspirationPromptRow, error) {
	var row inspirationPromptRow
	var imageKey string
	err := scanner.Scan(&row.ID, &row.Title, &row.Category, &row.Prompt, &row.Source, &imageKey, &row.Width, &row.Height, &row.SortOrder, &row.Enabled)
	if imageKey != "" {
		row.ImageURL = inspirationImageURL(imageKey)
	}
	return row, err
}

type inspirationPromptInput struct {
	Title     string `json:"title"`
	Category  string `json:"category"`
	Prompt    string `json:"prompt"`
	Source    string `json:"source"`
	SortOrder int    `json:"sortOrder"`
	Enabled   *bool  `json:"enabled"`
}

func (s *server) saveInspirationPrompt(w http.ResponseWriter, r *http.Request, id string) {
	if !s.requireSettingsUser(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "灵感提示词管理需要连接 PostgreSQL 数据库")
		return
	}
	var input inspirationPromptInput
	if !decode(r, &input) {
		s.error(w, 400, "INSPIRATION_INPUT_INVALID", "提示词格式不正确")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Category = strings.TrimSpace(input.Category)
	input.Prompt = strings.TrimSpace(input.Prompt)
	input.Source = strings.TrimSpace(input.Source)
	if input.Title == "" || len([]rune(input.Title)) > 160 || input.Category == "" || len([]rune(input.Category)) > 80 || input.Prompt == "" || len([]rune(input.Prompt)) > 20000 || len([]rune(input.Source)) > 500 || input.SortOrder < -1000000 || input.SortOrder > 1000000 {
		s.error(w, 400, "INSPIRATION_INPUT_INVALID", "请填写标题、分类和提示词；标题最多 160 字，分类最多 80 字，提示词最多 20000 字，来源最多 500 字")
		return
	}
	enabled := input.Enabled == nil || *input.Enabled
	var row inspirationPromptRow
	var err error
	status := http.StatusOK
	if id == "" {
		id = "manual_" + randomID()
		row, err = scanInspirationPrompt(s.db.QueryRow("INSERT INTO inspiration_prompts(id,title,category,prompt,source,sort_order,enabled) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING "+inspirationPromptColumns, id, input.Title, input.Category, input.Prompt, input.Source, input.SortOrder, enabled))
		status = http.StatusCreated
	} else {
		// Text edits keep the imported example image, dimensions and creation date.
		row, err = scanInspirationPrompt(s.db.QueryRow("UPDATE inspiration_prompts SET title=$2,category=$3,prompt=$4,source=$5,sort_order=$6,enabled=$7 WHERE id=$1 RETURNING "+inspirationPromptColumns, id, input.Title, input.Category, input.Prompt, input.Source, input.SortOrder, enabled))
	}
	if errors.Is(err, sql.ErrNoRows) {
		s.error(w, 404, "INSPIRATION_NOT_FOUND", "提示词不存在或已被删除")
		return
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词保存失败，请重试")
		return
	}
	s.json(w, status, map[string]any{"prompt": row})
}

func (s *server) inspirationPromptByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	id := strings.TrimPrefix(r.URL.Path, "/v1/inspiration/prompts/")
	if id == "" || strings.Contains(id, "/") {
		s.error(w, 404, "INSPIRATION_NOT_FOUND", "提示词不存在或已被删除")
		return
	}
	switch r.Method {
	case http.MethodPut:
		s.saveInspirationPrompt(w, r, id)
	case http.MethodDelete:
		if !s.requireSettingsUser(w, r) {
			return
		}
		if s.db == nil {
			s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "灵感提示词管理需要连接 PostgreSQL 数据库")
			return
		}
		result, err := s.db.Exec("DELETE FROM inspiration_prompts WHERE id=$1", id)
		if err != nil {
			s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词删除失败，请重试")
			return
		}
		count, err := result.RowsAffected()
		if err != nil {
			s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词删除失败，请重试")
			return
		}
		if count == 0 {
			s.error(w, 404, "INSPIRATION_NOT_FOUND", "提示词不存在或已被删除")
			return
		}
		s.json(w, 200, map[string]bool{"success": true})
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}
