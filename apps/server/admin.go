package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"
)

type publicModel struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	EndpointID string `json:"endpointId,omitempty"`
	PriceMinor int64  `json:"priceMinor"`
	Enabled    bool   `json:"enabled"`
	IsDefault  bool   `json:"isDefault"`
	Version    int64  `json:"version"`
}

func (s *server) initializePublicModels() error {
	if s.db == nil {
		return nil
	}
	endpoints, err := s.ai.list()
	if err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var migrated bool
	if err = tx.QueryRow("SELECT models_migrated FROM operation_settings WHERE id=true FOR UPDATE").Scan(&migrated); err != nil {
		return err
	}
	if migrated {
		return nil
	}
	modelCounts := map[string]int{}
	for _, e := range endpoints {
		if e.Purpose == "image" {
			modelCounts[e.Model]++
		}
	}
	for _, e := range endpoints {
		if e.Purpose != "image" {
			continue
		}
		id := "model_" + randomID()
		if _, err = tx.Exec("INSERT INTO public_models(id,name,endpoint_id,price_minor) VALUES($1,$2,$3,0)", id, e.Name, e.ID); err != nil {
			return err
		}
		// Preserve private presets and their version history through the identifier change.
		condition := "(config->>'endpointId'=$1 OR (COALESCE(config->>'endpointId','')='' AND config->>'model'=$3 AND $4))"
		if _, err = tx.Exec("UPDATE personal_prompts SET config=jsonb_set(jsonb_set(config,'{endpointId}',to_jsonb($2::text)),'{model}',to_jsonb($5::text)) WHERE kind='preset' AND "+condition, e.ID, id, e.Model, modelCounts[e.Model] == 1, e.Name); err != nil {
			return err
		}
		if _, err = tx.Exec(`UPDATE personal_prompt_versions SET snapshot=jsonb_set(jsonb_set(snapshot,'{config,endpointId}',to_jsonb($2::text)),'{config,model}',to_jsonb($5::text)) WHERE snapshot->>'kind'='preset' AND (snapshot#>>'{config,endpointId}'=$1 OR (COALESCE(snapshot#>>'{config,endpointId}','')='' AND snapshot#>>'{config,model}'=$3 AND $4))`, e.ID, id, e.Model, modelCounts[e.Model] == 1, e.Name); err != nil {
			return err
		}
		if _, err = tx.Exec(`UPDATE generation_tasks SET input=jsonb_set(jsonb_set(input,'{endpointId}',to_jsonb($2::text)),'{model}',to_jsonb($5::text)) WHERE input->>'endpointId'=$1 OR (COALESCE(input->>'endpointId','')='' AND input->>'model'=$3 AND $4)`, e.ID, id, e.Model, modelCounts[e.Model] == 1, e.Name); err != nil {
			return err
		}
	}

	if _, err = tx.Exec("UPDATE operation_settings SET models_migrated=true WHERE id=true"); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *server) publicModels(onlyAvailable bool) ([]publicModel, error) {
	models := []publicModel{}
	if s.db == nil {
		return models, nil
	}
	rows, err := s.db.Query("SELECT id,name,endpoint_id,price_minor,enabled,is_default,version FROM public_models ORDER BY is_default DESC,created_at,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m publicModel
		if err = rows.Scan(&m.ID, &m.Name, &m.EndpointID, &m.PriceMinor, &m.Enabled, &m.IsDefault, &m.Version); err != nil {
			return nil, err
		}
		if onlyAvailable {
			if !m.Enabled {
				continue
			}
			if _, err = s.ai.resolve("image", m.EndpointID, ""); err != nil {
				continue
			}
		}
		models = append(models, m)
	}
	return models, rows.Err()
}
func (s *server) resolvePublicModel(id, legacyModel string) (publicModel, error) {
	models, err := s.publicModels(true)
	if err != nil {
		return publicModel{}, err
	}
	if id != "" {
		for _, m := range models {
			if m.ID == id {
				return m, nil
			}
		}
	}
	// Compatibility for older private presets: only an unambiguous published channel.
	matches := []publicModel{}
	for _, m := range models {
		if id != "" && m.EndpointID == id {
			matches = append(matches, m)
		}
		if id == "" && legacyModel != "" {
			e, eErr := s.ai.resolve("image", m.EndpointID, "")
			if eErr == nil && (legacyModel == m.ID || legacyModel == e.Model) {
				matches = append(matches, m)
			}
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if id == "" && legacyModel == "" {
		for _, m := range models {
			if m.IsDefault {
				return m, nil
			}
		}
		if len(models) == 1 {
			return models[0], nil
		}
	}
	return publicModel{}, fmt.Errorf("所选模型未上架或已停用，请重新选择")
}
func (s *server) adminHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.requireAdmin(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "运营后台需要 PostgreSQL 数据库")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/admin/")
	// Reuse existing editors, with the same permission check on legacy API routes.
	for prefix, handler := range map[string]http.HandlerFunc{"ai-endpoints": s.aiEndpoints, "prompt-templates": s.promptTemplates, "prompt-reverse-settings": s.promptReverseSettingsHandler, "site-settings": s.siteSettingsHandler, "inspiration/prompts": s.inspirationPrompts, "inspiration/categories": s.inspirationCategories} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			copyRequest := r.Clone(r.Context())
			urlCopy := *r.URL
			urlCopy.Path = "/v1/" + path
			copyRequest.URL = &urlCopy
			if prefix == "ai-endpoints" && path != prefix {
				handler = s.aiEndpointByID
			}
			if prefix == "inspiration/prompts" && path != prefix {
				handler = s.inspirationPromptByID
			}
			if prefix == "inspiration/categories" && path != prefix {
				handler = s.inspirationCategoryByID
			}
			recorder := &auditResponseWriter{ResponseWriter: w, status: 200}
			handler(recorder, copyRequest)
			if r.Method != "GET" && recorder.status < 400 {
				u, _ := s.currentUser(r)
				s.audit(u.ID, r.Method+" "+prefix, strings.TrimPrefix(path, prefix), "配置已更新")
			}
			return
		}
	}
	switch {
	case path == "storage":
		s.adminStorage(w, r)
	case path == "settings":
		s.adminSettings(w, r)
	case path == "models" || strings.HasPrefix(path, "models/"):
		s.adminModels(w, r, strings.TrimPrefix(path, "models"))
	case path == "users" || strings.HasPrefix(path, "users/"):
		s.adminUsers(w, r, strings.TrimPrefix(path, "users"))
	case path == "overview":
		s.adminOverview(w, r)
	case path == "tasks":
		s.adminTasks(w, r)
	case path == "audit":
		s.adminAudit(w, r)
	default:
		s.error(w, 404, "NOT_FOUND", "页面不存在")
	}
}

type auditResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *auditResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (s *server) adminSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		c, err := s.operationSettings()
		if err != nil {
			s.error(w, 503, "SETTINGS_UNAVAILABLE", "配置读取失败")
			return
		}
		s.json(w, 200, c)
		return
	}
	if r.Method != "PUT" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var c operationSettings
	if !decode(r, &c) {
		s.error(w, 400, "SETTINGS_INVALID", "配置格式错误")
		return
	}
	c.CreditName = strings.TrimSpace(c.CreditName)
	if !validOperationSettings(c) {
		s.error(w, 400, "SETTINGS_INVALID", "请检查积分名称、金额和请求上限")
		return
	}
	raw, _ := json.Marshal(c)
	u, _ := s.currentUser(r)
	tx, err := s.db.Begin()
	if err == nil {
		defer tx.Rollback()
		_, err = tx.Exec("UPDATE operation_settings SET config=$1::jsonb WHERE id=true", raw)
		if err == nil {
			_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,detail) VALUES($1,'settings.update',$2)", u.ID, string(raw))
		}
		if err == nil {
			err = tx.Commit()
		}
	}
	if err != nil {
		s.error(w, 500, "SETTINGS_STORAGE_ERROR", "保存失败")
		return
	}
	s.json(w, 200, c)
}
func (s *server) adminModels(w http.ResponseWriter, r *http.Request, suffix string) {
	id := strings.TrimPrefix(suffix, "/")
	if r.Method == "GET" && id == "" {
		models, err := s.publicModels(false)
		if err != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		s.json(w, 200, map[string]any{"models": models})
		return
	}
	if r.Method != "POST" && r.Method != "PUT" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "模型请使用上架、下架管理")
		return
	}
	if (r.Method == "POST" && id != "") || (r.Method == "PUT" && id == "") {
		s.error(w, 404, "NOT_FOUND", "模型不存在")
		return
	}
	var m publicModel
	if !decode(r, &m) {
		s.error(w, 400, "MODEL_INVALID", "模型格式错误")
		return
	}
	m.Name = strings.TrimSpace(m.Name)
	if utf8.RuneCountInString(m.Name) < 1 || utf8.RuneCountInString(m.Name) > 80 || m.PriceMinor < 0 || m.PriceMinor > 100000000 || (m.IsDefault && !m.Enabled) {
		s.error(w, 400, "MODEL_INVALID", "请检查名称、单价和上架状态")
		return
	}
	endpoints, err := s.ai.list()
	exists := false
	for _, e := range endpoints {
		if e.ID == m.EndpointID && e.Purpose == "image" && (!m.Enabled || e.Enabled) {
			exists = true
		}
	}
	if err != nil || !exists {
		s.error(w, 400, "MODEL_ENDPOINT_INVALID", "请选择可用的生图服务通道")
		return
	}
	if id == "" {
		id = "model_" + randomID()
	}
	u, _ := s.currentUser(r)
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "MODEL_STORAGE_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	// Serialize default changes and catalog mutations against task reservation.
	_, err = tx.Exec("SELECT pg_advisory_xact_lock(79140001)")
	if err == nil && m.IsDefault {
		_, err = tx.Exec("UPDATE public_models SET is_default=false WHERE is_default")
	}
	var result sql.Result
	if err == nil {
		if r.Method == "POST" {
			result, err = tx.Exec("INSERT INTO public_models(id,name,endpoint_id,price_minor,enabled,is_default) VALUES($1,$2,$3,$4,$5,$6)", id, m.Name, m.EndpointID, m.PriceMinor, m.Enabled, m.IsDefault)
		} else {
			result, err = tx.Exec("UPDATE public_models SET name=$2,endpoint_id=$3,price_minor=$4,enabled=$5,is_default=$6,version=version+1 WHERE id=$1", id, m.Name, m.EndpointID, m.PriceMinor, m.Enabled, m.IsDefault)
		}
	}
	if err == nil {
		n, _ := result.RowsAffected()
		if n == 0 {
			s.error(w, 404, "MODEL_NOT_FOUND", "模型不存在")
			return
		}
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'model.save',$2,$3)", u.ID, id, fmt.Sprintf("%s; 单价=%d; 上架=%t", m.Name, m.PriceMinor, m.Enabled))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "MODEL_STORAGE_ERROR", "保存失败")
		return
	}
	s.json(w, 200, map[string]string{"id": id})
}
func (s *server) adminUsers(w http.ResponseWriter, r *http.Request, suffix string) {
	parts := strings.Split(strings.TrimPrefix(suffix, "/"), "/")
	if r.Method == "GET" && parts[0] == "" {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if len(q) > 80 {
			s.error(w, 400, "SEARCH_INVALID", "搜索内容过长")
			return
		}
		rows, err := s.db.Query(`SELECT u.id,u.username,u.role,u.status,u.created_at,a.available,a.held,EXISTS(SELECT 1 FROM environment_admin e WHERE e.user_id=u.id) FROM users u JOIN credit_accounts a ON a.user_id=u.id WHERE u.username ILIKE '%'||$1||'%' ORDER BY u.created_at DESC LIMIT 100`, q)
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
	actor, _ := s.currentUser(r)
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
	if !decode(r, &input) || (input.Role != "admin" && input.Role != "user") || (input.Status != "active" && input.Status != "disabled") {
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
	var oldRole, oldStatus string
	if err == nil {
		err = tx.QueryRow("SELECT role,status FROM users WHERE id=$1 FOR UPDATE", parts[0]).Scan(&oldRole, &oldStatus)
	}
	if err == sql.ErrNoRows {
		s.error(w, 404, "USER_NOT_FOUND", "用户不存在")
		return
	}
	if err == nil && (input.Role != "admin" || input.Status != "active") {
		var managed bool
		err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM environment_admin WHERE user_id=$1)", parts[0]).Scan(&managed)
		if err == nil && managed {
			s.error(w, 409, "ENVIRONMENT_ADMIN_MANAGED", "该管理员由 .env 管理，请先清空 ADMIN_USERNAME 和 ADMIN_PASSWORD 并重建 API 容器后再修改角色或停用")
			return
		}
	}
	if err == nil && oldRole == "admin" && oldStatus == "active" && (input.Role != "admin" || input.Status != "active") {
		var n int
		err = tx.QueryRow("SELECT count(*) FROM users WHERE role='admin' AND status='active'").Scan(&n)
		if err == nil && n <= 1 {
			s.error(w, 409, "LAST_ADMIN", "至少保留一位启用的管理员")
			return
		}
	}
	if err == nil {
		_, err = tx.Exec("UPDATE users SET role=$2,status=$3 WHERE id=$1", parts[0], input.Role, input.Status)
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
func (s *server) adjustCredits(w http.ResponseWriter, r *http.Request, actor, id string) {
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
func (s *server) adminOverview(w http.ResponseWriter, r *http.Request) {
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
func (s *server) adminTasks(w http.ResponseWriter, r *http.Request) {
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
func (s *server) adminAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	rows, err := s.db.Query(`SELECT a.id,COALESCE(u.username,a.actor_id),a.action,a.target_id,a.detail,a.created_at FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`)
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
