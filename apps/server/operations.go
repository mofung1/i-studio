package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"unicode/utf8"
)

const creditScale int64 = 100
const maxCreditMinor int64 = 1000000000000

type operationSettings struct {
	CreditName                string `json:"creditName"`
	RegistrationEnabled       bool   `json:"registrationEnabled"`
	SignupGiftMinor           int64  `json:"signupGiftMinor"`
	MaxConcurrentTasks        int    `json:"maxConcurrentTasks"`
	GenerationRequestsPerHour int    `json:"generationRequestsPerHour"`
	AuxiliaryRequestsPerHour  int    `json:"auxiliaryRequestsPerHour"`
}

func defaultOperationSettings() operationSettings {
	return operationSettings{"积分", true, 0, 2, 30, 20}
}
func (s *server) operationSettings() (operationSettings, error) {
	config := defaultOperationSettings()
	if s.db == nil {
		return config, nil
	}
	var raw []byte
	err := s.db.QueryRow("SELECT config FROM operation_settings WHERE id=true").Scan(&raw)
	if err != nil {
		return config, err
	}
	err = json.Unmarshal(raw, &config)
	return config, err
}
func validOperationSettings(c operationSettings) bool {
	return utf8.RuneCountInString(c.CreditName) >= 1 && utf8.RuneCountInString(c.CreditName) <= 12 && !strings.ContainsAny(c.CreditName, "\r\n\t<>") && c.SignupGiftMinor >= 0 && c.SignupGiftMinor <= 100000000 && c.MaxConcurrentTasks >= 1 && c.MaxConcurrentTasks <= 16 && c.GenerationRequestsPerHour >= 1 && c.GenerationRequestsPerHour <= 1000 && c.AuxiliaryRequestsPerHour >= 1 && c.AuxiliaryRequestsPerHour <= 1000
}
func (s *server) currentUser(r *http.Request) (user, bool) {
	payload, ok := s.verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if !ok {
		return user{}, false
	}
	id, _ := payload["sub"].(string)
	if id == "" {
		return user{}, false
	}
	var u user
	if s.db != nil {
		err := s.db.QueryRow("SELECT id,username,role,status,auth_version FROM users WHERE id=$1", id).Scan(&u.ID, &u.Username, &u.Role, &u.Status, &u.AuthVersion)
		return u, err == nil && u.Status == "active" && tokenVersionMatches(payload, u)
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, v := range s.users {
		if v.ID == id {
			return v, v.Status != "disabled" && tokenVersionMatches(payload, v)
		}
	}
	return user{}, false
}
func (s *server) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	u, ok := s.currentUser(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return false
	}
	if u.Role != "admin" {
		s.error(w, 403, "ADMIN_REQUIRED", "仅管理员可访问后台配置")
		return false
	}
	return true
}
func (s *server) publicOperationSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	c, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "SETTINGS_UNAVAILABLE", "网站配置暂时不可用")
		return
	}
	s.json(w, 200, map[string]any{"creditName": c.CreditName, "creditScale": creditScale, "registrationEnabled": c.RegistrationEnabled})
}
func (s *server) audit(actor, action, target, detail string) {
	if s.db != nil {
		if _, err := s.db.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,$2,$3,$4)", actor, action, target, detail); err != nil {
			fmt.Printf("audit storage failed: %v\n", err)
		}
	}
}
func (s *server) accountHandler(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	c, err := s.operationSettings()
	if err != nil || s.db == nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "账户暂时不可用")
		return
	}
	var available, held int64
	if err = s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id=$1", u.ID).Scan(&available, &held); err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "账户暂时不可用")
		return
	}
	rows, err := s.db.Query(`SELECT id,kind,available_delta,held_delta,available_after,held_after,task_id,note,created_at FROM credit_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100`, u.ID)
	if err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "流水暂时不可用")
		return
	}
	defer rows.Close()
	ledger := []map[string]any{}
	for rows.Next() {
		var id, delta, heldDelta, after, heldAfter int64
		var kind, taskID, note, created string
		if err = rows.Scan(&id, &kind, &delta, &heldDelta, &after, &heldAfter, &taskID, &note, &created); err != nil {
			break
		}
		ledger = append(ledger, map[string]any{"id": id, "kind": kind, "availableDelta": delta, "heldDelta": heldDelta, "availableAfter": after, "heldAfter": heldAfter, "taskId": taskID, "note": note, "createdAt": created})
	}
	if err != nil || rows.Err() != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "流水暂时不可用")
		return
	}
	s.json(w, 200, map[string]any{"user": map[string]string{"id": u.ID, "username": u.Username, "role": u.Role}, "available": available, "held": held, "creditName": c.CreditName, "creditScale": creditScale, "ledger": ledger})
}

// Only explicit deployment commands can grant the initial administrator role.
func runAdminCommand(args []string) int {
	flags := flag.NewFlagSet("admin", flag.ContinueOnError)
	username := flags.String("username", "", "已注册用户名")
	if flags.Parse(args) != nil || !validUsername(strings.ToLower(*username)) {
		fmt.Fprintln(os.Stderr, "用法: server admin --username 已注册用户名")
		return 2
	}
	db, err := openDatabase()
	if err != nil || db == nil {
		fmt.Fprintln(os.Stderr, "需要可用的 DATABASE_URL")
		return 1
	}
	defer db.Close()
	if err = migrateDatabase(db); err != nil {
		fmt.Fprintln(os.Stderr, "数据库迁移失败:", err)
		return 1
	}
	tx, err := db.Begin()
	if err != nil {
		return 1
	}
	defer tx.Rollback()
	var id string
	err = tx.QueryRow("UPDATE users SET role='admin',status='active' WHERE username=$1 RETURNING id", strings.ToLower(*username)).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		fmt.Fprintln(os.Stderr, "账号不存在，请先在前台注册")
		return 1
	}
	if err == nil {
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES('deployment-cli','admin.promote',$1,'部署者显式指定管理员')", id)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "设置管理员失败:", err)
		return 1
	}
	fmt.Printf("账号 %s 已设为管理员。\n", strings.ToLower(*username))
	return 0
}

func (s *server) allowAuthAttempt(r *http.Request) bool {
	if s.db == nil {
		return true
	}
	// Forwarded headers are only considered for explicitly trusted proxies.
	host := authSourceIP(r)
	var count int
	err := s.db.QueryRow(`INSERT INTO auth_attempts(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET
 count=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.count+1 END,
 window_start=CASE WHEN auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_start END RETURNING count`, host).Scan(&count)
	return err == nil && count <= 60
}
func (s *server) requireAuxiliaryUser(w http.ResponseWriter, r *http.Request) bool {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return false
	}
	if s.db == nil {
		return true
	}
	c, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "SETTINGS_UNAVAILABLE", "服务暂时不可用")
		return false
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 503, "USAGE_UNAVAILABLE", "服务暂时不可用")
		return false
	}
	defer tx.Rollback()
	var id string
	err = tx.QueryRow("SELECT id FROM users WHERE id=$1 FOR UPDATE", uid).Scan(&id)
	var count int
	if err == nil {
		err = tx.QueryRow("SELECT count(*) FROM auxiliary_usage WHERE user_id=$1 AND created_at>now()-interval '1 hour'", uid).Scan(&count)
	}
	if err != nil {
		s.error(w, 503, "USAGE_UNAVAILABLE", "服务暂时不可用")
		return false
	}
	if count >= c.AuxiliaryRequestsPerHour {
		w.Header().Set("Retry-After", "3600")
		s.error(w, 429, "AUXILIARY_RATE_LIMIT", "本小时提示词辅助请求已达上限，请稍后再试")
		return false
	}
	_, err = tx.Exec("INSERT INTO auxiliary_usage(user_id,kind) VALUES($1,$2)", uid, r.URL.Path)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 503, "USAGE_UNAVAILABLE", "服务暂时不可用")
		return false
	}
	return true
}

func (s *server) registerAccount(u user, gift int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.Exec("INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)", u.ID, u.Username, u.PasswordHash)
	if err == nil {
		_, err = tx.Exec("INSERT INTO credit_accounts(user_id,available) VALUES($1,$2)", u.ID, gift)
	}
	if err == nil && gift > 0 {
		_, err = tx.Exec(`INSERT INTO credit_ledger(user_id,kind,available_delta,held_delta,available_after,held_after,request_key,note) VALUES($1,'signup',$2,0,$2,0,'signup','注册赠送')`, u.ID, gift)
	}
	if err == nil {
		err = tx.Commit()
	}
	return err
}

func authSourceIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	trusted := []*net.IPNet{}
	for _, raw := range strings.Split(os.Getenv("AUTH_TRUSTED_PROXY_CIDRS"), ",") {
		if _, network, err := net.ParseCIDR(strings.TrimSpace(raw)); err == nil {
			trusted = append(trusted, network)
		}
	}
	isTrusted := func(value string) bool {
		ip := net.ParseIP(value)
		if ip == nil {
			return false
		}
		for _, network := range trusted {
			if network.Contains(ip) {
				return true
			}
		}
		return false
	}
	if !isTrusted(host) {
		return host
	}
	forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(forwarded) - 1; i >= 0; i-- {
		candidate := strings.TrimSpace(forwarded[i])
		if net.ParseIP(candidate) == nil {
			return host
		}
		if !isTrusted(candidate) {
			return candidate
		}
	}
	return host
}
