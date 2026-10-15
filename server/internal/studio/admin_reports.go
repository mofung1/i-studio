package studio

import (
	"net/http"
)

func (s *Service) adminOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var users, active, today, failed int64
	var available, held, charged int64
	err := s.db.QueryRow(`SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM generation_tasks WHERE status IN ('queued','processing','waiting_provider')),(SELECT count(*) FROM generation_charges WHERE created_at>=current_date),(SELECT count(*) FROM generation_tasks WHERE created_at>=current_date AND status='failed'),COALESCE((SELECT sum(available) FROM credit_accounts),0),COALESCE((SELECT sum(held) FROM credit_accounts),0),COALESCE((SELECT sum(charged) FROM generation_charges WHERE created_at>=current_date),0)`).Scan(&users, &active, &today, &failed, &available, &held, &charged)
	if err != nil {
		s.error(w, 500, "OVERVIEW_UNAVAILABLE", "概览读取失败")
		return
	}
	s.json(w, 200, map[string]int64{"users": users, "activeTasks": active, "todayTasks": today, "todayFailed": failed, "available": available, "held": held, "todayCharged": charged})
}

func (s *Service) adminTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	rows, err := s.db.Query(`SELECT t.id,u.username,t.status,t.created_at,COALESCE(t.error_message,''),COALESCE(c.model_name,''),COALESCE(c.unit_price*c.quantity,0),COALESCE(c.charged,0),COALESCE(c.refunded,0),COALESCE(c.settled,true) FROM generation_tasks t JOIN users u ON u.id=t.user_id LEFT JOIN generation_charges c ON c.task_id=t.id ORDER BY t.created_at DESC LIMIT 100`)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, name, status, created, message, model string
		var reserved, charged, refunded int64
		var settled bool
		if err = rows.Scan(&id, &name, &status, &created, &message, &model, &reserved, &charged, &refunded, &settled); err != nil {
			break
		}
		items = append(items, map[string]any{"id": id, "username": name, "status": status, "createdAt": created, "errorMessage": message, "modelName": model, "reserved": reserved, "charged": charged, "refunded": refunded, "settled": settled})
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "任务读取失败")
		return
	}
	s.json(w, 200, map[string]any{"tasks": items})
}

func (s *Service) adminAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	rows, err := s.db.Query(`SELECT a.id,COALESCE(u.username,a.actor_id),a.action,a.target_id,a.detail,a.created_at FROM admin_audit a LEFT JOIN admin_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`)
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
	s.json(w, 200, map[string]any{"audit": items})
}
