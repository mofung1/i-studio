package studio

import (
	"encoding/json"
	"net/http"
)

// Task results are grouped by the task's submission day. Credit consumption is
// grouped by the settlement day and uses the net amount after refunds.
const adminOverviewSQL = `
WITH report_day AS (
  SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date AS today
), task_days AS (
  SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
         count(*) AS submitted,
         count(*) FILTER (WHERE status = 'succeeded') AS completed,
         count(*) FILTER (WHERE status = 'failed') AS failed
  FROM generation_tasks CROSS JOIN report_day
  WHERE created_at >= ((today - 6)::timestamp AT TIME ZONE 'Asia/Shanghai')
    AND created_at < ((today + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
  GROUP BY 1
), credit_days AS (
  SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS day,
         sum(-available_delta - held_delta) AS charged
  FROM credit_ledger CROSS JOIN report_day
  WHERE kind = 'settlement'
    AND created_at >= ((today - 6)::timestamp AT TIME ZONE 'Asia/Shanghai')
    AND created_at < ((today + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
  GROUP BY 1
), calendar AS (
  SELECT today - days_ago AS day FROM report_day CROSS JOIN generate_series(0, 6) AS days_ago
), trend AS (
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(calendar.day, 'YYYY-MM-DD'),
    'submitted', COALESCE(tasks.submitted, 0),
    'completed', COALESCE(tasks.completed, 0),
    'failed', COALESCE(tasks.failed, 0),
    'charged', COALESCE(credits.charged, 0)
  ) ORDER BY calendar.day) AS days
  FROM calendar
  LEFT JOIN task_days AS tasks USING (day)
  LEFT JOIN credit_days AS credits USING (day)
)
SELECT (SELECT count(*) FROM users),
       (SELECT count(*) FROM generation_tasks WHERE status IN ('queued', 'processing', 'waiting_provider')),
       (SELECT count(*) FROM generation_charges WHERE created_at >= ` + platformDaySQL + `),
       COALESCE(tasks.failed, 0),
       COALESCE((SELECT sum(available) FROM credit_accounts), 0),
       COALESCE((SELECT sum(held) FROM credit_accounts), 0),
       COALESCE(credits.charged, 0),
       trend.days
FROM report_day CROSS JOIN trend
LEFT JOIN task_days AS tasks ON tasks.day = report_day.today
LEFT JOIN credit_days AS credits ON credits.day = report_day.today`

func (s *Service) adminOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var users, active, today, failed int64
	var available, held, charged int64
	var taskTrend json.RawMessage
	err := s.db.QueryRowContext(r.Context(), adminOverviewSQL).Scan(&users, &active, &today, &failed, &available, &held, &charged, &taskTrend)
	if err != nil {
		s.error(w, 500, "OVERVIEW_UNAVAILABLE", "概览读取失败")
		return
	}
	c, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "OVERVIEW_UNAVAILABLE", "成本策略读取失败")
		return
	}
	var auxToday, auxActive, gifts, storageBytes, storageFull int64
	err = s.db.QueryRowContext(r.Context(), `SELECT (SELECT count(*) FROM auxiliary_runs WHERE started_at>=`+platformDaySQL+`),(SELECT count(*) FROM auxiliary_runs WHERE finished_at IS NULL AND lease_until>now()),COALESCE((SELECT sum(available_delta) FROM credit_ledger WHERE kind='signup' AND created_at>=`+platformDaySQL+`),0),(SELECT COALESCE(sum(size_bytes),0) FROM assets)+(SELECT COALESCE(sum(storage_bytes),0) FROM prompt_reverse_tasks),(SELECT count(*) FROM users WHERE account_storage_bytes(id)>=$1)`, c.AccountStorageLimitBytes).Scan(&auxToday, &auxActive, &gifts, &storageBytes, &storageFull)
	if err != nil {
		s.error(w, 503, "OVERVIEW_UNAVAILABLE", "成本用量读取失败")
		return
	}
	s.json(w, 200, map[string]any{
		"users":                      users,
		"activeTasks":                active,
		"todayTasks":                 today,
		"todayFailed":                failed,
		"available":                  available,
		"held":                       held,
		"todayCharged":               charged,
		"taskTrend":                  taskTrend,
		"auxiliaryToday":             auxToday,
		"auxiliaryActive":            auxActive,
		"auxiliaryDailyLimit":        c.PlatformAuxiliaryPerDay,
		"auxiliaryConcurrentLimit":   c.PlatformAuxiliaryConcurrent,
		"signupGiftToday":            gifts,
		"signupGiftDailyBudgetMinor": c.SignupGiftDailyBudgetMinor,
		"dailyCreditAlertMinor":      c.DailyCreditAlertMinor,
		"storageBytes":               storageBytes,
		"storageFullAccounts":        storageFull,
	})
}

func (s *Service) adminTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	tx, page, err := s.beginAdminPage(r, `SELECT count(*) FROM generation_tasks t JOIN users u ON u.id=t.user_id`)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	defer tx.Rollback()
	order := adminSortOrder(r, map[string]string{"createdAt": "t.created_at", "username": "u.username", "status": "t.status", "reserved": "COALESCE(c.unit_price*c.quantity,0)", "charged": "COALESCE(c.charged,0)", "refunded": "COALESCE(c.refunded,0)"}, "t.created_at DESC")
	rows, err := tx.QueryContext(r.Context(), `SELECT t.id,u.username,t.status,t.created_at,COALESCE(t.error_message,''),COALESCE(c.model_name,''),COALESCE(c.unit_price*c.quantity,0),COALESCE(c.charged,0),COALESCE(c.refunded,0),COALESCE(c.settled,true),COALESCE(t.input->>'aspectRatio',''),COALESCE(t.input->>'resolution',''),COALESCE((SELECT jsonb_agg(jsonb_build_object('width',a.width,'height',a.height,'elapsedMs',d.elapsed_ms) ORDER BY d.position NULLS LAST,a.created_at,a.id) FROM assets a LEFT JOIN generation_deliveries d ON d.task_id=a.task_id AND d.asset_id=a.id WHERE a.task_id=t.id),'[]'::jsonb) FROM generation_tasks t JOIN users u ON u.id=t.user_id LEFT JOIN generation_charges c ON c.task_id=t.id ORDER BY `+order+`,t.id DESC LIMIT $1 OFFSET $2`, page.PageSize, page.offset())
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, status, created, message, model string
		var ratio, resolution string
		var detailRaw []byte
		var reserved, charged, refunded int64
		var settled bool
		if err = rows.Scan(&id, &name, &status, &created, &message, &model, &reserved, &charged, &refunded, &settled, &ratio, &resolution, &detailRaw); err != nil {
			break
		}
		var details []map[string]any
		_ = json.Unmarshal(detailRaw, &details)
		items = append(items, map[string]any{"aspectRatio": ratio, "resolution": resolution, "resultDetails": details, "id": id, "username": name, "status": status, "createdAt": created, "errorMessage": message, "modelName": model, "reserved": reserved, "charged": charged, "refunded": refunded, "settled": settled})
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	if err = rows.Close(); err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	if err = tx.Commit(); err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	s.json(w, 200, page.response("tasks", items))
}

func (s *Service) adminAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	tx, page, err := s.beginAdminPage(r, "SELECT count(*) FROM admin_audit")
	if err != nil {
		s.error(w, 500, "AUDIT_UNAVAILABLE", "日志读取失败")
		return
	}
	defer tx.Rollback()
	order := adminSortOrder(r, map[string]string{"createdAt": "a.created_at", "actor": "COALESCE(u.username,a.actor_id)"}, "a.id DESC")
	rows, err := tx.QueryContext(r.Context(), `SELECT a.id,COALESCE(u.username,a.actor_id),a.action,a.target_id,a.detail,a.created_at FROM admin_audit a LEFT JOIN admin_users u ON u.id=a.actor_id ORDER BY `+order+`,a.id DESC LIMIT $1 OFFSET $2`, page.PageSize, page.offset())
	if err != nil {
		s.error(w, 500, "AUDIT_UNAVAILABLE", "审计读取失败")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id int64
		var actor, action, target, detail, created string
		if err = rows.Scan(&id, &actor, &action, &target, &detail, &created); err != nil {
			break
		}
		items = append(items, map[string]any{"id": id, "actor": actor, "action": action, "targetId": target, "detail": detail, "createdAt": created})
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 500, "AUDIT_UNAVAILABLE", "审计读取失败")
		return
	}
	if err = rows.Close(); err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "AUDIT_UNAVAILABLE", "日志读取失败")
		return
	}
	s.json(w, 200, page.response("audit", items))
}
