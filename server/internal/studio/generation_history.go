package studio

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
)

func (s *Service) listGenerationTasks(w http.ResponseWriter, r *http.Request, uid string) {
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
	rows, err := s.db.Query("SELECT t.id,COALESCE(t.project_id,''),t.status,t.created_at,t.input,t.result_images,t.result_modules,COALESCE(t.error_message,''),COALESCE((SELECT jsonb_agg(jsonb_build_object('contentPath','/v1/assets/'||a.id||'/content','width',a.width,'height',a.height,'sizeBytes',a.size_bytes,'elapsedMs',d.elapsed_ms)) FROM assets a LEFT JOIN generation_deliveries d ON d.task_id=a.task_id AND d.asset_id=a.id WHERE a.task_id=t.id AND a.user_id=t.user_id),'[]'::jsonb) FROM generation_tasks t"+q.where()+order, q.args...)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "记录查询失败")
		return
	}
	defer rows.Close()
	items := []domain.GenerationTask{}
	dates := []time.Time{}
	for rows.Next() {
		var t domain.GenerationTask
		var date time.Time
		var input, images, modules, details []byte
		if err = rows.Scan(&t.ID, &t.ProjectID, &t.Status, &date, &input, &images, &modules, &t.ErrorMessage, &details); err != nil {
			break
		}
		t.UserID = uid
		_ = json.Unmarshal(details, &t.ResultDetails)
		t.ErrorMessage = publicGenerationError(t.ErrorMessage)
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
