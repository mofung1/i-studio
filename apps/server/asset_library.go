package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"golang.org/x/image/draw"
)

const assetLibraryMigration = `
ALTER TABLE assets ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_assets_owner_date ON assets(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_date ON generation_tasks(user_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING gin(tags);`

type pageCursor struct {
	Date   time.Time `json:"date"`
	ID     string    `json:"id"`
	Oldest bool      `json:"oldest"`
}

func encodePageCursor(date time.Time, id string, oldest bool) string {
	raw, _ := json.Marshal(pageCursor{date, id, oldest})
	return base64.RawURLEncoding.EncodeToString(raw)
}
func decodePageCursor(value string, oldest bool) (pageCursor, error) {
	var cursor pageCursor
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) > 512 {
		return cursor, errors.New("invalid cursor")
	}
	if err = json.Unmarshal(raw, &cursor); err != nil || cursor.Date.IsZero() || cursor.ID == "" || len(cursor.ID) > 100 || cursor.Oldest != oldest {
		return cursor, errors.New("invalid cursor")
	}
	return cursor, nil
}

type libraryQuery struct {
	conditions []string
	args       []any
}

func (q *libraryQuery) add(condition string, value any) {
	q.args = append(q.args, value)
	q.conditions = append(q.conditions, fmt.Sprintf(condition, len(q.args)))
}
func (q *libraryQuery) where() string { return " WHERE " + strings.Join(q.conditions, " AND ") }
func (q *libraryQuery) dates(r *http.Request, column string) error {
	for _, item := range []struct {
		key, operator string
		end           bool
	}{{"from", ">=", false}, {"to", "<", true}} {
		if value := r.URL.Query().Get(item.key); value != "" {
			date, err := time.ParseInLocation("2006-01-02", value, generationStorageLocation)
			if err != nil {
				return err
			}
			if item.end {
				date = date.AddDate(0, 0, 1)
			}
			q.add(column+" "+item.operator+" $%d", date)
		}
	}
	return nil
}
func (q *libraryQuery) page(r *http.Request, column, idColumn string) (string, error) {
	oldest := r.URL.Query().Get("sort") == "oldest"
	direction, operator := "DESC", "<"
	if oldest {
		direction, operator = "ASC", ">"
	}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		cursor, err := decodePageCursor(raw, oldest)
		if err != nil {
			return "", err
		}
		q.args = append(q.args, cursor.Date, cursor.ID)
		q.conditions = append(q.conditions, fmt.Sprintf("(%s,%s) %s ($%d,$%d)", column, idColumn, operator, len(q.args)-1, len(q.args)))
	}
	q.args = append(q.args, clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)+1)
	return fmt.Sprintf(" ORDER BY %s %s,%s %s LIMIT $%d", column, direction, idColumn, direction, len(q.args)), nil
}
func (s *server) requireLibraryUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	w.Header().Set("Cache-Control", "no-store")
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return "", false
	}
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "作品管理需要连接数据库")
		return "", false
	}
	return uid, true
}
func normalizedTags(values []string) ([]string, error) {
	tags := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		if len([]rune(value)) > 32 {
			return nil, errors.New("标签最多 32 字")
		}
		seen[value] = true
		tags = append(tags, value)
	}
	if len(tags) > 12 {
		return nil, errors.New("最多添加 12 个标签")
	}
	return tags, nil
}

type libraryAsset struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Filename      string    `json:"filename"`
	Mime          string    `json:"mime"`
	Width         int       `json:"width"`
	Height        int       `json:"height"`
	SizeBytes     int64     `json:"sizeBytes"`
	Favorite      bool      `json:"favorite"`
	Tags          []string  `json:"tags"`
	ProjectID     string    `json:"projectId"`
	ProjectName   string    `json:"projectName"`
	CreatedAt     time.Time `json:"createdAt"`
	ContentPath   string    `json:"contentPath"`
	ThumbnailPath string    `json:"thumbnailPath"`
	Task          *task     `json:"task,omitempty"`
}

func (s *server) libraryAssets(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodPatch {
		s.editLibraryAssets(w, r, uid)
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	q := libraryQuery{}
	q.add("a.user_id=$%d", uid)
	kind := r.URL.Query().Get("kind")
	if kind == "uploads" {
		q.conditions = append(q.conditions, "a.task_id IS NULL")
	} else {
		q.conditions = append(q.conditions, "a.task_id IS NOT NULL", "t.status NOT IN ('queued','processing','waiting_provider')", "t.result_images ? ('/v1/assets/'||a.id||'/content')")
	}
	if value := r.URL.Query().Get("projectId"); value == "unfiled" {
		q.conditions = append(q.conditions, "a.project_id IS NULL")
	} else if value != "" {
		q.add("a.project_id=$%d", value)
	}
	if r.URL.Query().Get("favorite") == "true" {
		q.conditions = append(q.conditions, "a.favorite=true")
	}
	for _, item := range []struct{ key, condition string }{{"tag", "a.tags ? $%d"}, {"model", "t.input->>'model'=$%d"}, {"taskType", "COALESCE(t.input->>'taskType','general')=$%d"}} {
		if value := r.URL.Query().Get(item.key); value != "" {
			q.add(item.condition, value)
		}
	}
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		q.add("concat_ws(' ',a.title,a.filename,a.tags::text,t.input->>'prompt',t.input->>'requirements') ILIKE $%d", "%"+escapeLike(value)+"%")
	}
	if err := q.dates(r, "a.created_at"); err != nil {
		s.error(w, 400, "FILTER_INVALID", "日期格式不正确")
		return
	}
	join := " FROM assets a LEFT JOIN generation_tasks t ON t.id=a.task_id AND t.user_id=a.user_id LEFT JOIN projects p ON p.id=a.project_id AND p.user_id=a.user_id"
	var total int
	if err := s.db.QueryRow("SELECT count(*)"+join+q.where(), q.args...).Scan(&total); err != nil {
		s.error(w, 500, "LIBRARY_ERROR", "作品查询失败")
		return
	}
	order, err := q.page(r, "a.created_at", "a.id")
	if err != nil {
		s.error(w, 400, "CURSOR_INVALID", "分页已失效，请刷新列表")
		return
	}
	rows, err := s.db.Query(`SELECT a.id,a.title,a.filename,a.mime,a.width,a.height,a.size_bytes,a.favorite,a.tags,COALESCE(a.project_id,''),COALESCE(p.name,''),a.created_at,COALESCE(t.id,''),COALESCE(t.status,''),t.created_at,COALESCE(t.input,'{}'::jsonb),COALESCE(t.result_images,'[]'::jsonb),COALESCE(t.result_modules,'[]'::jsonb),COALESCE(t.error_message,'')`+join+q.where()+order, q.args...)
	if err != nil {
		s.error(w, 500, "LIBRARY_ERROR", "作品查询失败")
		return
	}
	defer rows.Close()
	items := []libraryAsset{}
	for rows.Next() {
		var a libraryAsset
		var t task
		var date sql.NullTime
		var tags, input, images, modules []byte
		if err = rows.Scan(&a.ID, &a.Title, &a.Filename, &a.Mime, &a.Width, &a.Height, &a.SizeBytes, &a.Favorite, &tags, &a.ProjectID, &a.ProjectName, &a.CreatedAt, &t.ID, &t.Status, &date, &input, &images, &modules, &t.ErrorMessage); err != nil {
			break
		}
		_ = json.Unmarshal(tags, &a.Tags)
		if a.Tags == nil {
			a.Tags = []string{}
		}
		a.ContentPath = "/v1/assets/" + a.ID + "/content"
		a.ThumbnailPath = "/v1/assets/" + a.ID + "/thumbnail"
		if t.ID != "" {
			t.CreatedAt = date.Time.UTC().Format(time.RFC3339Nano)
			_ = json.Unmarshal(input, &t.Input)
			_ = json.Unmarshal(images, &t.ResultImages)
			_ = json.Unmarshal(modules, &t.ResultModules)
			a.Task = &t
		}
		items = append(items, a)
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 500, "LIBRARY_ERROR", "作品查询失败")
		return
	}
	limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)
	next := ""
	if len(items) > limit {
		items = items[:limit]
		last := items[len(items)-1]
		next = encodePageCursor(last.CreatedAt, last.ID, r.URL.Query().Get("sort") == "oldest")
	}
	s.json(w, 200, map[string]any{"assets": items, "total": total, "nextCursor": next})
}
func escapeLike(value string) string {
	return strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(value)
}

type assetEdit struct {
	IDs       []string  `json:"ids"`
	Title     *string   `json:"title"`
	Favorite  *bool     `json:"favorite"`
	Tags      *[]string `json:"tags"`
	ProjectID *string   `json:"projectId"`
}

func (s *server) editLibraryAssets(w http.ResponseWriter, r *http.Request, uid string) {
	var input assetEdit
	if !decode(r, &input) || len(input.IDs) == 0 || len(input.IDs) > 100 {
		s.error(w, 400, "ASSET_INPUT_INVALID", "一次可操作 1–100 张图片")
		return
	}
	if input.Title != nil {
		v := strings.TrimSpace(*input.Title)
		input.Title = &v
		if len(input.IDs) != 1 || len([]rune(v)) > 160 {
			s.error(w, 400, "ASSET_INPUT_INVALID", "名称最多 160 字，一次编辑一张图片")
			return
		}
	}
	if input.Tags != nil {
		tags, err := normalizedTags(*input.Tags)
		if err != nil {
			s.error(w, 400, "ASSET_INPUT_INVALID", err.Error())
			return
		}
		input.Tags = &tags
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "LIBRARY_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	if input.ProjectID != nil && *input.ProjectID != "" {
		var exists bool
		if tx.QueryRow("SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND user_id=$2 AND archived=false)", *input.ProjectID, uid).Scan(&exists) != nil || !exists {
			s.error(w, 404, "PROJECT_NOT_FOUND", "项目不存在或已归档")
			return
		}
	}
	seen := map[string]bool{}
	sort.Strings(input.IDs)
	for _, id := range input.IDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		var found string
		if tx.QueryRow("SELECT id FROM assets WHERE id=$1 AND user_id=$2 FOR UPDATE", id, uid).Scan(&found) != nil {
			s.error(w, 404, "ASSET_NOT_FOUND", "部分图片不存在或无权访问")
			return
		}
	}
	for id := range seen {
		args := []any{id, uid}
		sets := []string{}
		if input.Title != nil {
			args = append(args, *input.Title)
			sets = append(sets, fmt.Sprintf("title=$%d", len(args)))
		}
		if input.Favorite != nil {
			args = append(args, *input.Favorite)
			sets = append(sets, fmt.Sprintf("favorite=$%d", len(args)))
		}
		if input.ProjectID != nil {
			args = append(args, nullableString(*input.ProjectID))
			sets = append(sets, fmt.Sprintf("project_id=$%d", len(args)))
		}
		if input.Tags != nil {
			raw, _ := json.Marshal(*input.Tags)
			args = append(args, raw)
			sets = append(sets, fmt.Sprintf("tags=$%d::jsonb", len(args)))
		}
		if len(sets) == 0 {
			s.error(w, 400, "ASSET_INPUT_INVALID", "没有需要保存的修改")
			return
		}
		if _, err = tx.Exec("UPDATE assets SET "+strings.Join(sets, ",")+" WHERE id=$1 AND user_id=$2", args...); err != nil {
			s.error(w, 500, "LIBRARY_ERROR", "保存失败")
			return
		}
	}
	if input.ProjectID != nil && *input.ProjectID != "" {
		_, err = tx.Exec("UPDATE projects SET updated_at=now() WHERE id=$1 AND user_id=$2", *input.ProjectID, uid)
	}
	if err != nil || tx.Commit() != nil {
		s.error(w, 500, "LIBRARY_ERROR", "保存失败")
		return
	}
	s.json(w, 200, map[string]any{"updated": len(seen)})
}
func (s *server) projectByID(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/projects/")
	if id == "" || strings.Contains(id, "/") {
		s.error(w, 404, "PROJECT_NOT_FOUND", "项目不存在")
		return
	}
	if r.Method == http.MethodDelete {
		result, err := s.db.Exec("DELETE FROM projects WHERE id=$1 AND user_id=$2", id, uid)
		if err != nil {
			s.error(w, 500, "PROJECT_ERROR", "项目删除失败")
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			s.error(w, 404, "PROJECT_NOT_FOUND", "项目不存在")
			return
		}
		s.json(w, 200, map[string]any{"deleted": id})
		return
	}
	if r.Method != http.MethodPatch {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		Name     *string `json:"name"`
		Archived *bool   `json:"archived"`
	}
	if !decode(r, &input) || (input.Name == nil && input.Archived == nil) {
		s.error(w, 400, "PROJECT_INPUT_INVALID", "请填写项目名称或归档状态")
		return
	}
	if input.Name != nil {
		value := strings.TrimSpace(*input.Name)
		input.Name = &value
		if value == "" || len([]rune(value)) > 80 {
			s.error(w, 400, "PROJECT_INPUT_INVALID", "项目名称需为 1–80 字")
			return
		}
	}
	result, err := s.db.Exec("UPDATE projects SET name=COALESCE($3,name),archived=COALESCE($4,archived),updated_at=now() WHERE id=$1 AND user_id=$2", id, uid, input.Name, input.Archived)
	if err != nil {
		s.error(w, 500, "PROJECT_ERROR", "项目保存失败")
		return
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		s.error(w, 404, "PROJECT_NOT_FOUND", "项目不存在")
		return
	}
	s.json(w, 200, map[string]any{"updated": id})
}
func (s *server) listGenerationTasks(w http.ResponseWriter, r *http.Request, uid string) {
	q := libraryQuery{}
	q.add("t.user_id=$%d", uid)
	for _, item := range []struct{ key, condition string }{{"mode", "t.input->>'mode'=$%d"}, {"taskType", "t.input->>'taskType'=$%d"}, {"model", "t.input->>'model'=$%d"}, {"status", "t.status=$%d"}} {
		if value := r.URL.Query().Get(item.key); value != "" {
			q.add(item.condition, value)
		}
	}
	if value := r.URL.Query().Get("projectId"); value == "unfiled" {
		q.conditions = append(q.conditions, "t.project_id IS NULL")
	} else if value != "" {
		if !s.userOwnsProject(uid, value) {
			s.error(w, 404, "PROJECT_NOT_FOUND", "项目不存在")
			return
		}
		q.add("(t.project_id=$%[1]d OR EXISTS(SELECT 1 FROM assets a WHERE a.task_id=t.id AND a.user_id=t.user_id AND a.project_id=$%[1]d))", value)
	}
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		q.add("concat_ws(' ',t.input->>'prompt',t.input->>'requirements',t.input->>'productName') ILIKE $%d", "%"+escapeLike(value)+"%")
	}
	if err := q.dates(r, "t.created_at"); err != nil {
		s.error(w, 400, "FILTER_INVALID", "日期格式不正确")
		return
	}
	var total int
	if err := s.db.QueryRow("SELECT count(*) FROM generation_tasks t"+q.where(), q.args...).Scan(&total); err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "记录查询失败")
		return
	}
	order, err := q.page(r, "t.created_at", "t.id")
	if err != nil {
		s.error(w, 400, "CURSOR_INVALID", "分页已失效，请刷新列表")
		return
	}
	rows, err := s.db.Query("SELECT t.id,COALESCE(t.project_id,''),t.status,t.created_at,t.input,t.result_images,t.result_modules,COALESCE(t.error_message,'') FROM generation_tasks t"+q.where()+order, q.args...)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "记录查询失败")
		return
	}
	defer rows.Close()
	items := []task{}
	dates := []time.Time{}
	for rows.Next() {
		var t task
		var date time.Time
		var input, images, modules []byte
		if err = rows.Scan(&t.ID, &t.ProjectID, &t.Status, &date, &input, &images, &modules, &t.ErrorMessage); err != nil {
			break
		}
		t.CreatedAt = date.UTC().Format(time.RFC3339Nano)
		_ = json.Unmarshal(input, &t.Input)
		_ = json.Unmarshal(images, &t.ResultImages)
		_ = json.Unmarshal(modules, &t.ResultModules)
		items = append(items, t)
		dates = append(dates, date)
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "记录查询失败")
		return
	}
	limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)
	next := ""
	if len(items) > limit {
		items = items[:limit]
		next = encodePageCursor(dates[limit-1], items[limit-1].ID, r.URL.Query().Get("sort") == "oldest")
	}
	s.json(w, 200, map[string]any{"tasks": items, "total": total, "nextCursor": next})
}
func (s *server) libraryDownload(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		IDs []string `json:"ids"`
	}
	if !decode(r, &input) || len(input.IDs) == 0 || len(input.IDs) > 100 {
		s.error(w, 400, "ASSET_INPUT_INVALID", "一次可下载 1–100 张图片")
		return
	}
	files := []io.ReadCloser{}
	names := []string{}
	seen := map[string]bool{}
	var total int64
	defer func() {
		for _, file := range files {
			_ = file.Close()
		}
	}()
	for _, id := range input.IDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		var key, name, mime string
		var size int64
		if s.db.QueryRow("SELECT storage_key,COALESCE(NULLIF(title,''),filename),mime,size_bytes FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key, &name, &mime, &size) != nil {
			s.error(w, 404, "ASSET_NOT_FOUND", "部分图片不存在或无权访问")
			return
		}
		total += size
		if total > 250<<20 {
			s.error(w, 400, "DOWNLOAD_TOO_LARGE", "单次下载最多 250 MB，请分批选择")
			return
		}
		file, err := s.storage.Open(key)
		if err != nil {
			s.error(w, 404, "ASSET_FILE_NOT_FOUND", "部分图片文件无法读取")
			return
		}
		files = append(files, file)
		name = strings.TrimSuffix(filepath.Base(strings.ReplaceAll(name, "\\", "/")), filepath.Ext(name))
		name = strings.Map(func(c rune) rune {
			if c < ' ' || strings.ContainsRune("/\\:", c) {
				return '_'
			}
			return c
		}, name)
		names = append(names, fmt.Sprintf("%03d_%s%s", len(files), name, extensionForMime(mime)))
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="istudio-assets.zip"`)
	archive := zip.NewWriter(w)
	defer archive.Close()
	for index, file := range files {
		entry, err := archive.Create(names[index])
		if err != nil {
			return
		}
		if _, err = io.Copy(entry, file); err != nil {
			return
		}
	}
}

var thumbnailSlots = make(chan struct{}, 2)

func (s *server) assetThumbnail(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/assets/"), "/thumbnail")
	var key string
	if s.db.QueryRow("SELECT storage_key FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key) != nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	select {
	case thumbnailSlots <- struct{}{}:
		defer func() { <-thumbnailSlots }()
	case <-r.Context().Done():
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		s.error(w, 404, "ASSET_FILE_NOT_FOUND", "图片文件不存在")
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxGeneratedImageBytes+1))
	if err != nil || len(raw) > maxGeneratedImageBytes {
		s.error(w, 400, "IMAGE_INVALID", "图片无法读取")
		return
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40_000_000 {
		s.error(w, 400, "IMAGE_INVALID", "图片尺寸不支持预览")
		return
	}
	source, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		s.error(w, 400, "IMAGE_INVALID", "图片无法读取")
		return
	}
	width, height := config.Width, config.Height
	if max(width, height) > 480 {
		scale := 480.0 / float64(max(width, height))
		width = max(1, int(float64(width)*scale))
		height = max(1, int(float64(height)*scale))
	}
	thumb := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(thumb, thumb.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(thumb, thumb.Bounds(), source, source.Bounds(), draw.Over, nil)
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_ = jpeg.Encode(w, thumb, &jpeg.Options{Quality: 85})
}
