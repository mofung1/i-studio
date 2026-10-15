package studio

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
)

func (s *Service) requireLibraryUser(w http.ResponseWriter, r *http.Request) (string, bool) {
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
	ID            string                 `json:"id"`
	Title         string                 `json:"title"`
	Filename      string                 `json:"filename"`
	Mime          string                 `json:"mime"`
	Width         int                    `json:"width"`
	Height        int                    `json:"height"`
	SizeBytes     int64                  `json:"sizeBytes"`
	Favorite      bool                   `json:"favorite"`
	Tags          []string               `json:"tags"`
	ProjectID     string                 `json:"projectId"`
	ProjectName   string                 `json:"projectName"`
	CreatedAt     time.Time              `json:"createdAt"`
	ContentPath   string                 `json:"contentPath"`
	ThumbnailPath string                 `json:"thumbnailPath"`
	Task          *domain.GenerationTask `json:"task,omitempty"`
}

func (s *Service) libraryAssets(w http.ResponseWriter, r *http.Request) {
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
	q.conditions = append(q.conditions, "a.hidden_at IS NULL")
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
		var t domain.GenerationTask
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
			t.ErrorMessage = publicGenerationError(t.ErrorMessage)
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

type assetEdit struct {
	IDs       []string  `json:"ids"`
	Title     *string   `json:"title"`
	Favorite  *bool     `json:"favorite"`
	Tags      *[]string `json:"tags"`
	ProjectID *string   `json:"projectId"`
}

func (s *Service) editLibraryAssets(w http.ResponseWriter, r *http.Request, uid string) {
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
			args = append(args, repository.NullableString(*input.ProjectID))
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
