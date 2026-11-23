package studio

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
)

func (s *Service) listGenerationTasks(w http.ResponseWriter, r *http.Request, uid string) {
	q := libraryQuery{}
	q.add("t.user_id=$%d", uid)
	for _, item := range []struct{ key, condition string }{{"mode", "t.input->>'mode'=$%d"}, {"productId", "t.input->>'productId'=$%d"}, {"taskType", "t.input->>'taskType'=$%d"}, {"model", "t.input->>'model'=$%d"}, {"status", "t.status=$%d"}} {
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
	items, err := s.readTaskHistory(r.Context(), q, order)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "记录查询失败")
		return
	}
	limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)
	next := ""
	if len(items) > limit {
		items = items[:limit]
		last := items[limit-1]
		next = encodePageCursor(last.createdAt, last.ID, r.URL.Query().Get("sort") == "oldest")
	}
	s.json(w, 200, map[string]any{"tasks": items, "total": total, "nextCursor": next})
}

func (s *Service) tasksBatch(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	var input struct {
		IDs []string `json:"ids"`
	}
	if !decode(r, &input) || len(input.IDs) == 0 || len(input.IDs) > 100 {
		s.error(w, 400, "TASK_INPUT_INVALID", "一次可查询 1–100 个任务")
		return
	}
	seen := make(map[string]bool, len(input.IDs))
	ids := make([]string, 0, len(input.IDs))
	for _, id := range input.IDs {
		if strings.TrimSpace(id) == "" || len(id) > 100 || strings.ContainsRune(id, 0) {
			s.error(w, 400, "TASK_INPUT_INVALID", "任务编号无效")
			return
		}
		if !seen[id] {
			ids = append(ids, id)
			seen[id] = true
		}
	}
	if s.db != nil {
		q := libraryQuery{}
		q.add("t.user_id=$%d", uid)
		q.add("t.id=ANY($%d::text[])", ids)
		items, err := s.readTaskHistory(r.Context(), q, " ORDER BY array_position($2::text[],t.id)")
		if err != nil {
			s.error(w, 500, "TASK_STORAGE_ERROR", "记录查询失败")
			return
		}
		s.json(w, 200, map[string]any{"tasks": items})
		return
	}
	items := make([]domain.GenerationTask, 0, len(ids))
	s.mu.RLock()
	for _, id := range ids {
		if task, ok := s.tasks[id]; ok && task.UserID == uid {
			task.ErrorMessage = publicGenerationError(task.ErrorMessage)
			items = append(items, task)
		}
	}
	s.mu.RUnlock()
	s.json(w, 200, map[string]any{"tasks": items})
}

type taskHistoryRow struct {
	domain.GenerationTask
	createdAt time.Time
}

func (s *Service) readTaskHistory(ctx context.Context, q libraryQuery, order string) ([]taskHistoryRow, error) {
	const columns = `SELECT t.id, COALESCE(t.project_id,''), t.status, t.created_at,
		t.input, t.result_images, t.result_modules, COALESCE(t.error_message,''),
		COALESCE((SELECT jsonb_agg(jsonb_build_object('contentPath','/v1/assets/'||a.id||'/content',
			'width',a.width,'height',a.height,'sizeBytes',a.size_bytes,'elapsedMs',d.elapsed_ms)
			ORDER BY a.created_at,a.id)
			FROM assets a LEFT JOIN generation_deliveries d ON d.task_id=a.task_id AND d.asset_id=a.id
			WHERE a.task_id=t.id AND a.user_id=t.user_id),'[]'::jsonb)
		FROM generation_tasks t`
	rows, err := s.db.QueryContext(ctx, columns+q.where()+order, q.args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []taskHistoryRow{}
	for rows.Next() {
		var t taskHistoryRow
		var input, images, modules, details []byte
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.Status, &t.createdAt, &input, &images, &modules, &t.ErrorMessage, &details); err != nil {
			return nil, err
		}
		t.CreatedAt = t.createdAt.UTC().Format(time.RFC3339Nano)
		t.ErrorMessage = publicGenerationError(t.ErrorMessage)
		_ = json.Unmarshal(input, &t.Input)
		_ = json.Unmarshal(images, &t.ResultImages)
		_ = json.Unmarshal(modules, &t.ResultModules)
		_ = json.Unmarshal(details, &t.ResultDetails)
		items = append(items, t)
	}
	return items, rows.Err()
}
