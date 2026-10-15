package studio

import (
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
)

func (s *Service) projects(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.db == nil {
		s.json(w, 200, map[string]any{"projects": []any{}})
		return
	}
	if r.Method == http.MethodPost {
		var body struct {
			Name string `json:"name"`
		}
		if !decode(r, &body) {
			s.error(w, 400, "PROJECT_INPUT_INVALID", "项目名称不能为空")
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" || len([]rune(name)) > 80 {
			s.error(w, 400, "PROJECT_INPUT_INVALID", "项目名称需为 1-80 个字符")
			return
		}
		id := idgen.New()
		_, err := s.db.Exec("INSERT INTO projects (id,user_id,name) VALUES ($1,$2,$3)", id, uid, name)
		if err != nil {
			s.error(w, 500, "PROJECT_STORAGE_ERROR", "项目保存失败")
			return
		}
		s.json(w, 201, map[string]any{"project": map[string]any{"id": id, "name": name}})
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	rows, err := s.db.Query(`SELECT p.id,p.name,p.created_at,p.updated_at,p.archived,
		(SELECT COUNT(*) FROM assets a WHERE a.project_id=p.id AND a.hidden_at IS NULL),
		(SELECT COUNT(*) FROM generation_tasks t WHERE t.user_id=p.user_id AND (t.project_id=p.id OR EXISTS(SELECT 1 FROM assets a WHERE a.task_id=t.id AND a.user_id=p.user_id AND a.project_id=p.id)))
		FROM projects p WHERE p.user_id=$1 ORDER BY p.updated_at DESC`, uid)
	if err != nil {
		s.error(w, 500, "PROJECT_STORAGE_ERROR", "项目查询失败")
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, name string
		var created, updated time.Time
		var assetCount, taskCount int
		var archived bool
		if rows.Scan(&id, &name, &created, &updated, &archived, &assetCount, &taskCount) == nil {
			list = append(list, map[string]any{"id": id, "name": name, "createdAt": created, "updatedAt": updated, "assetCount": assetCount, "taskCount": taskCount, "archived": archived})
		}
	}
	s.json(w, 200, map[string]any{"projects": list})
}

func (s *Service) projectByID(w http.ResponseWriter, r *http.Request) {
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
