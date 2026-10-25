package studio

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

const inspirationPromptColumns = "id,title,category,prompt,source,image_key,image_width,image_height,sort_order,enabled,COALESCE(submission_id,''),instructions,requires_reference"

type inspirationScanner interface {
	Scan(dest ...any) error
}

func scanInspirationPrompt(scanner inspirationScanner) (inspirationPromptRow, error) {
	var row inspirationPromptRow
	var imageKey string
	err := scanner.Scan(&row.ID, &row.Title, &row.Category, &row.Prompt, &row.Source, &imageKey, &row.Width, &row.Height, &row.SortOrder, &row.Enabled, &row.SubmissionID, &row.Instructions, &row.RequiresReference)
	if imageKey != "" {
		row.ImageURL = inspirationImageURL(imageKey)
	}
	return row, err
}

type inspirationPromptInput struct {
	Title         string `json:"title"`
	Category      string `json:"category"`
	CategoryID    string `json:"categoryId"`
	Prompt        string `json:"prompt"`
	Source        string `json:"source"`
	SortOrder     int    `json:"sortOrder"`
	Enabled       *bool  `json:"enabled"`
	ReverseTaskID string `json:"reverseTaskId,omitempty"`
}

func (s *Service) saveInspirationPrompt(w http.ResponseWriter, r *http.Request, id string) {
	if !s.requireSettingsUser(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "灵感提示词管理需要连接 PostgreSQL 数据库")
		return
	}
	if id != "" {
		var submitted bool
		if err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM inspiration_prompts WHERE id=$1 AND submission_id IS NOT NULL)", id).Scan(&submitted); err != nil {
			s.submissionFailure(w, err)
			return
		}
		if submitted {
			s.error(w, 409, "SUBMISSION_REVIEW_REQUIRED", "用户投稿请在用户投稿审核中处理，修改内容需重新审核")
			return
		}
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
	tx, err := repository.BeginInspirationEdit(s.db)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词保存失败")
		return
	}
	defer tx.Rollback()
	imageKey, width, height := "", 0, 0
	if input.ReverseTaskID != "" {
		s.error(w, 400, "INSPIRATION_IMAGE_INVALID", "后台不能引用前台私有分析图片，请取消封面选项")
		return
	}
	if input.CategoryID != "" {
		if err = tx.QueryRow("SELECT name FROM inspiration_categories WHERE id=$1", input.CategoryID).Scan(&input.Category); errors.Is(err, sql.ErrNoRows) {
			s.error(w, 400, "INSPIRATION_CATEGORY_NOT_FOUND", "分类已变更，请重新选择")
			return
		}
	} else {
		err = repository.EnsureInspirationCategory(tx, input.Category)
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类读取失败")
		return
	}
	status := http.StatusOK
	if id == "" {
		id = "manual_" + idgen.New()
		row, err = scanInspirationPrompt(tx.QueryRow("INSERT INTO inspiration_prompts(id,title,category,prompt,source,sort_order,enabled,image_key,image_width,image_height) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING "+inspirationPromptColumns, id, input.Title, input.Category, input.Prompt, input.Source, input.SortOrder, enabled, imageKey, width, height))
		status = http.StatusCreated
	} else {
		// Text edits keep the imported example image, dimensions and creation date.
		row, err = scanInspirationPrompt(tx.QueryRow("UPDATE inspiration_prompts SET title=$2,category=$3,prompt=$4,source=$5,sort_order=$6,enabled=$7 WHERE id=$1 RETURNING "+inspirationPromptColumns, id, input.Title, input.Category, input.Prompt, input.Source, input.SortOrder, enabled))
	}
	if errors.Is(err, sql.ErrNoRows) {
		s.error(w, 404, "INSPIRATION_NOT_FOUND", "提示词不存在或已被删除")
		return
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词保存失败，请重试")
		return
	}
	if err = tx.Commit(); err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词保存失败")
		return
	}
	s.json(w, status, map[string]any{"prompt": row})
}

func (s *Service) inspirationPromptByID(w http.ResponseWriter, r *http.Request) {
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
		var submitted bool
		if err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM inspiration_prompts WHERE id=$1 AND submission_id IS NOT NULL)", id).Scan(&submitted); err != nil {
			s.submissionFailure(w, err)
			return
		}
		if submitted {
			s.error(w, 409, "SUBMISSION_REVIEW_REQUIRED", "用户投稿请在用户投稿审核中下架，保留审核与奖励记录")
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
