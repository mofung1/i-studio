package main

import (
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
)

type inspirationPromptRow struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Category  string `json:"category"`
	Prompt    string `json:"prompt"`
	Source    string `json:"source"`
	ImageURL  string `json:"imageUrl"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	SortOrder int    `json:"sortOrder"`
	Enabled   bool   `json:"enabled"`
}

// Visitors see enabled prompts; signed-in management also includes disabled rows.
func (s *server) inspirationPrompts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodPost {
		s.saveInspirationPrompt(w, r, "")
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	includeDisabled := r.URL.Query().Get("includeDisabled") == "true"
	if includeDisabled && !s.requireSettingsUser(w, r) {
		return
	}
	if s.db == nil {
		if includeDisabled {
			s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "灵感提示词管理需要连接 PostgreSQL 数据库")
			return
		}
		s.json(w, 200, map[string]any{"prompts": []any{}, "categories": []any{}, "page": 1, "pageSize": 24, "total": 0})
		return
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	categoryQuery := strings.TrimSpace(r.URL.Query().Get("categoryQuery"))
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	page := clampInt(parseQueryInt(r.URL.Query().Get("page"), 1), 1, 200)
	pageSize := clampInt(parseQueryInt(r.URL.Query().Get("pageSize"), 24), 1, 60)

	where := "WHERE enabled = true"
	if includeDisabled {
		where = "WHERE true"
		if status := r.URL.Query().Get("status"); status == "enabled" {
			where += " AND enabled=true"
		} else if status == "disabled" {
			where += " AND enabled=false"
		}
	}
	args := []any{}
	if category != "" {
		where += " AND category = $" + strconv.Itoa(len(args)+1)
		args = append(args, category)
	}
	if categoryQuery != "" {
		where += " AND category ILIKE $" + strconv.Itoa(len(args)+1)
		args = append(args, "%"+categoryQuery+"%")
	}
	if query != "" {
		// 标题、分类、提示词和来源模糊匹配，大小写不敏感。
		where += " AND (title ILIKE $" + strconv.Itoa(len(args)+1) +
			" OR category ILIKE $" + strconv.Itoa(len(args)+1) +
			" OR prompt ILIKE $" + strconv.Itoa(len(args)+1) +
			" OR source ILIKE $" + strconv.Itoa(len(args)+1) + ")"
		args = append(args, "%"+query+"%")
	}

	var total int
	countSQL := "SELECT count(*) FROM inspiration_prompts " + where
	if err := s.db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "灵感库查询失败")
		return
	}

	offset := (page - 1) * pageSize
	querySQL := "SELECT " + inspirationPromptColumns + " FROM inspiration_prompts " + where +
		" ORDER BY sort_order ASC, id ASC LIMIT $" + strconv.Itoa(len(args)+1) + " OFFSET $" + strconv.Itoa(len(args)+2)
	rows, err := s.db.Query(querySQL, append(args, pageSize, offset)...)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "灵感库查询失败")
		return
	}
	defer rows.Close()

	list := []inspirationPromptRow{}
	for rows.Next() {
		row, err := scanInspirationPrompt(rows)
		if err != nil {
			s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "灵感库查询失败")
			return
		}
		list = append(list, row)
	}
	if err := rows.Err(); err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "灵感库查询失败")
		return
	}

	s.json(w, 200, map[string]any{
		"prompts":  list,
		"page":     page,
		"pageSize": pageSize,
		"total":    total,
	})
}

// Public lists show categories with enabled prompts; management also sees empty categories.
func (s *server) inspirationCategories(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.Method {
	case http.MethodGet:
		s.listInspirationCategories(w, r)
	case http.MethodPost:
		s.editInspirationCategory(w, r, "")
	default:
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

// inspirationImageURL 把 image_key 转成可访问的 URL：
// 配置了 CDN_BASE_URL 时直接返回 CDN 全址（图片已上传到 CDN），
// 否则走本地服务接口 /v1/inspiration/images/{key}。
func inspirationImageURL(imageKey string) string {
	if cdn := strings.TrimRight(env("CDN_BASE_URL", ""), "/"); cdn != "" && !strings.HasPrefix(imageKey, "@storage/") {
		return cdn + "/" + imageKey
	}
	return "/v1/inspiration/images/" + imageKey
}

// inspirationImage 返回本地存储的案例图。公开只读，长期缓存。
func (s *server) inspirationImage(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/v1/inspiration/images/")
	key = filepath.Clean("/" + key)
	key = strings.TrimPrefix(key, "/")
	if key == "" || strings.Contains(key, "..") {
		s.error(w, 404, "INSPIRATION_IMAGE_NOT_FOUND", "图片不存在")
		return
	}

	storageKey := key
	if !strings.HasPrefix(key, "@storage/") && !strings.HasPrefix(key, "inspiration/") {
		storageKey = "inspiration/" + key
	}
	if s.redirectStoredObject(w, r, storageKey) {
		return
	}
	file, err := s.storage.Open(storageKey)
	if err != nil {
		s.error(w, 404, "INSPIRATION_IMAGE_NOT_FOUND", "图片不存在")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", inspirationImageMime(filepath.Ext(key)))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = io.Copy(w, file)
}

func inspirationImageMime(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

func clampInt(value, min_, max_ int) int {
	if value < min_ {
		return min_
	}
	if value > max_ {
		return max_
	}
	return value
}

func parseQueryInt(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	return value
}
