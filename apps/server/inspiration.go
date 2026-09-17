package main

import (
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
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
}

// inspirationPrompts 分页返回已启用的提示词。公开只读，不要求登录。
func (s *server) inspirationPrompts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if s.db == nil {
		s.json(w, 200, map[string]any{"prompts": []any{}, "categories": []any{}, "page": 1, "pageSize": 24, "total": 0})
		return
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	page := clampInt(parseQueryInt(r.URL.Query().Get("page"), 1), 1, 200)
	pageSize := clampInt(parseQueryInt(r.URL.Query().Get("pageSize"), 24), 1, 60)

	where := "WHERE enabled = true"
	args := []any{}
	if category != "" {
		where += " AND category = $" + strconv.Itoa(len(args)+1)
		args = append(args, category)
	}
	if query != "" {
		// 标题、提示词、来源三字段模糊匹配，大小写不敏感
		where += " AND (title ILIKE $" + strconv.Itoa(len(args)+1) +
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
	querySQL := "SELECT id,title,category,prompt,source,image_key,image_width,image_height,sort_order FROM inspiration_prompts " + where +
		" ORDER BY sort_order ASC, id ASC LIMIT $" + strconv.Itoa(len(args)+1) + " OFFSET $" + strconv.Itoa(len(args)+2)
	rows, err := s.db.Query(querySQL, append(args, pageSize, offset)...)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "灵感库查询失败")
		return
	}
	defer rows.Close()

	list := []inspirationPromptRow{}
	for rows.Next() {
		var row inspirationPromptRow
		var imageKey string
		if err := rows.Scan(&row.ID, &row.Title, &row.Category, &row.Prompt, &row.Source, &imageKey, &row.Width, &row.Height, &row.SortOrder); err != nil {
			continue
		}
		if imageKey != "" {
			row.ImageURL = inspirationImageURL(imageKey)
		}
		list = append(list, row)
	}

	s.json(w, 200, map[string]any{
		"prompts":  list,
		"page":     page,
		"pageSize": pageSize,
		"total":    total,
	})
}

// inspirationCategories 返回各分类及其启用条数，供前端筛选 chips 展示。
func (s *server) inspirationCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if s.db == nil {
		s.json(w, 200, map[string]any{"categories": []any{}})
		return
	}

	rows, err := s.db.Query("SELECT category, count(*) FROM inspiration_prompts WHERE enabled = true GROUP BY category ORDER BY min(sort_order) ASC")
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类查询失败")
		return
	}
	defer rows.Close()

	type categoryCount struct {
		Category string `json:"category"`
		Count    int    `json:"count"`
	}
	list := []categoryCount{}
	for rows.Next() {
		var item categoryCount
		if rows.Scan(&item.Category, &item.Count) == nil {
			list = append(list, item)
		}
	}
	s.json(w, 200, map[string]any{"categories": list})
}

// inspirationImageURL 把 image_key 转成可访问的 URL：
// 配置了 CDN_BASE_URL 时直接返回 CDN 全址（图片已上传到 CDN），
// 否则走本地服务接口 /v1/inspiration/images/{key}。
func inspirationImageURL(imageKey string) string {
	if cdn := strings.TrimRight(env("CDN_BASE_URL", ""), "/"); cdn != "" {
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

	// image_key 只存文件名，本地文件统一放在 storage_root/inspiration/ 下
	path := filepath.Join(s.storageRoot, "inspiration", key)
	file, err := os.Open(path)
	if err != nil {
		s.error(w, 404, "INSPIRATION_IMAGE_NOT_FOUND", "图片不存在")
		return
	}
	defer file.Close()

	mime := inspirationImageMime(filepath.Ext(path))
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, filepath.Base(path), time.Time{}, file)
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

var _ = sql.ErrNoRows
