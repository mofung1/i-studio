package studio

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
)

func (s *Service) adminUsers(w http.ResponseWriter, r *http.Request, suffix string) {
	parts := strings.Split(strings.TrimPrefix(suffix, "/"), "/")
	if r.Method == "GET" && parts[0] == "" {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if len(q) > 80 {
			s.error(w, 400, "SEARCH_INVALID", "搜索内容过长")
			return
		}
		rows, err := s.db.Query(`SELECT u.id,u.username,u.role,u.status,u.created_at,a.available,a.held,false FROM users u JOIN credit_accounts a ON a.user_id=u.id WHERE u.username ILIKE '%'||$1||'%' ORDER BY u.created_at DESC LIMIT 100`, q)
		if err != nil {
			s.error(w, 500, "USERS_UNAVAILABLE", "用户读取失败")
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var id, name, role, status, created string
			var available, held int64
			var managed bool
			if err = rows.Scan(&id, &name, &role, &status, &created, &available, &held, &managed); err != nil {
				break
			}
			items = append(items, map[string]any{"id": id, "username": name, "role": role, "status": status, "createdAt": created, "available": available, "held": held, "environmentManaged": managed})
		}
		if err != nil || rows.Err() != nil {
			s.error(w, 500, "USERS_UNAVAILABLE", "用户读取失败")
			return
		}
		s.json(w, 200, map[string]any{"users": items})
		return
	}
	actor, _ := s.currentAdministrator(r)
	if len(parts) == 2 && parts[1] == "balance" && r.Method == "POST" {
		s.adjustCredits(w, r, actor.ID, parts[0])
		return
	}
	if len(parts) != 1 || r.Method != "PUT" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		Role   string `json:"role"`
		Status string `json:"status"`
	}
	if !decode(r, &input) || input.Role != "user" || (input.Status != "active" && input.Status != "disabled") {
		s.error(w, 400, "USER_INVALID", "角色或状态不正确")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "USER_STORAGE_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec("SELECT pg_advisory_xact_lock(79140002)")
	var oldStatus string
	if err == nil {
		err = tx.QueryRow("SELECT status FROM users WHERE id=$1 FOR UPDATE", parts[0]).Scan(&oldStatus)
	}
	if err == sql.ErrNoRows {
		s.error(w, 404, "USER_NOT_FOUND", "用户不存在")
		return
	}
	if err == nil {
		_, err = tx.Exec("UPDATE users SET role=$2,status=$3,auth_version=auth_version+CASE WHEN status<>$3 THEN 1 ELSE 0 END WHERE id=$1", parts[0], input.Role, input.Status)
	}
	if err == nil {
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'user.update',$2,$3)", actor.ID, parts[0], input.Role+" / "+input.Status)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "USER_STORAGE_ERROR", "保存失败")
		return
	}
	s.json(w, 200, map[string]bool{"saved": true})
}

func (s *Service) adjustCredits(w http.ResponseWriter, r *http.Request, actor, id string) {
	var input struct {
		Delta      int64  `json:"deltaMinor"`
		Note       string `json:"note"`
		RequestKey string `json:"requestKey"`
	}
	if !decode(r, &input) || input.Delta == 0 || input.Delta > maxCreditMinor || input.Delta < -maxCreditMinor || len(input.RequestKey) < 8 || len(input.RequestKey) > 100 || len([]rune(strings.TrimSpace(input.Note))) < 1 || len([]rune(input.Note)) > 200 {
		s.error(w, 400, "ADJUSTMENT_INVALID", "请填写有效金额、原因和请求编号")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "CREDIT_STORAGE_ERROR", "余额修改失败")
		return
	}
	defer tx.Rollback()
	var available, held int64
	err = tx.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id=$1 FOR UPDATE", id).Scan(&available, &held)
	if err == sql.ErrNoRows {
		s.error(w, 404, "USER_NOT_FOUND", "用户不存在")
		return
	}
	var oldDelta int64
	var oldNote, oldActor string
	if err == nil {
		e := tx.QueryRow("SELECT available_delta,note,actor_id FROM credit_ledger WHERE user_id=$1 AND request_key=$2", id, "admin:"+input.RequestKey).Scan(&oldDelta, &oldNote, &oldActor)
		if e == nil {
			if oldDelta != input.Delta || oldNote != input.Note || oldActor != actor {
				s.error(w, 409, "IDEMPOTENCY_CONFLICT", "请求编号已用于其他调整")
				return
			}
			s.json(w, 200, map[string]bool{"saved": true})
			return
		}
		if e != sql.ErrNoRows {
			err = e
		}
	}
	if err == nil && (available+input.Delta < 0 || available+input.Delta > maxCreditMinor) {
		s.error(w, 409, "BALANCE_INVALID", "可用余额不足或超过上限，预留余额不可扣减")
		return
	}
	if err == nil {
		_, err = tx.Exec("UPDATE credit_accounts SET available=available+$2,updated_at=now() WHERE user_id=$1", id, input.Delta)
	}
	if err == nil {
		_, err = tx.Exec(`INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,request_key,note,actor_id) VALUES($1,'adjustment',$2,0,$3,$4,$5,$6,$7)`, id, input.Delta, available+input.Delta, held, "admin:"+input.RequestKey, input.Note, actor)
	}
	if err == nil {
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'credit.adjust',$2,$3)", actor, id, fmt.Sprintf("%d: %s", input.Delta, input.Note))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "CREDIT_STORAGE_ERROR", "余额修改失败")
		return
	}
	s.json(w, 200, map[string]bool{"saved": true})
}
