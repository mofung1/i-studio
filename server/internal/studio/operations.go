package studio

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"unicode/utf8"

	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
)

const creditScale int64 = 100

const maxCreditMinor int64 = 1000000000000

type operationSettings struct {
	CreditName                   string `json:"creditName"`
	RegistrationEnabled          bool   `json:"registrationEnabled"`
	SignupGiftMinor              int64  `json:"signupGiftMinor"`
	MaxConcurrentTasks           int    `json:"maxConcurrentTasks"`
	GenerationRequestsPerHour    int    `json:"generationRequestsPerHour"`
	AuxiliaryRequestsPerHour     int    `json:"auxiliaryRequestsPerHour"`
	PlatformAuxiliaryConcurrent  int    `json:"platformAuxiliaryConcurrent"`
	PlatformAuxiliaryPerDay      int    `json:"platformAuxiliaryPerDay"`
	SignupGiftDailyBudgetMinor   int64  `json:"signupGiftDailyBudgetMinor"`
	DailyCreditAlertMinor        int64  `json:"dailyCreditAlertMinor"`
	AccountStorageLimitBytes     int64  `json:"accountStorageLimitBytes"`
	RegistrationInviteRequired   bool   `json:"registrationInviteRequired"`
	RegistrationInviteConfigured bool   `json:"registrationInviteConfigured"`
}

func defaultOperationSettings() operationSettings {
	return operationSettings{
		CreditName: "积分", RegistrationEnabled: true, MaxConcurrentTasks: 2,
		GenerationRequestsPerHour: 30, AuxiliaryRequestsPerHour: 20,
		PlatformAuxiliaryConcurrent: 4, PlatformAuxiliaryPerDay: 1000,
		SignupGiftDailyBudgetMinor: 100000, DailyCreditAlertMinor: 100000, AccountStorageLimitBytes: 1 << 30,
	}
}

func (s *Service) operationSettings() (operationSettings, error) {
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
	if err == nil {
		err = s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM registration_invite WHERE id=true)").Scan(&config.RegistrationInviteConfigured)
	}
	return config, err
}

func validOperationSettings(c operationSettings) bool {
	return utf8.RuneCountInString(c.CreditName) >= 1 && utf8.RuneCountInString(c.CreditName) <= 12 && !strings.ContainsAny(c.CreditName, "\r\n\t<>") &&
		c.SignupGiftMinor >= 0 && c.SignupGiftMinor <= 100000000 &&
		c.MaxConcurrentTasks >= 1 && c.MaxConcurrentTasks <= 16 &&
		c.GenerationRequestsPerHour >= 1 && c.GenerationRequestsPerHour <= 1000 &&
		c.AuxiliaryRequestsPerHour >= 1 && c.AuxiliaryRequestsPerHour <= 1000 &&
		c.PlatformAuxiliaryConcurrent >= 1 && c.PlatformAuxiliaryConcurrent <= 100 &&
		c.PlatformAuxiliaryPerDay >= 1 && c.PlatformAuxiliaryPerDay <= 1000000 &&
		c.SignupGiftDailyBudgetMinor >= 0 && c.SignupGiftDailyBudgetMinor <= maxCreditMinor &&
		c.DailyCreditAlertMinor >= 0 && c.DailyCreditAlertMinor <= maxCreditMinor &&
		c.AccountStorageLimitBytes >= 1 && c.AccountStorageLimitBytes <= 1<<40
}

func (s *Service) currentUser(r *http.Request) (domain.User, bool) {
	payload, ok := s.verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if !ok || payload["aud"] != "web" {
		return domain.User{}, false
	}
	id, _ := payload["sub"].(string)
	if id == "" {
		return domain.User{}, false
	}
	var u domain.User
	if s.db != nil {
		err := s.db.QueryRow("SELECT id,username,role,status,auth_version FROM users WHERE id=$1", id).Scan(&u.ID, &u.Username, &u.Role, &u.Status, &u.AuthVersion)
		return u, err == nil && u.Status == "active" && authn.VersionMatches(payload, u)
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, v := range s.users {
		if v.ID == id {
			return v, v.Status != "disabled" && authn.VersionMatches(payload, v)
		}
	}
	return domain.User{}, false
}

func (s *Service) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	_, ok := s.currentAdministrator(r)
	if !ok {
		if _, front := s.currentUser(r); front {
			s.error(w, 403, "ADMIN_REQUIRED", "请使用独立后台管理员账号登录")
			return false
		}
		s.error(w, 401, "AUTH_REQUIRED", "请先登录运营后台")
		return false
	}
	return true
}

func (s *Service) publicOperationSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	c, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "SETTINGS_UNAVAILABLE", "网站配置暂时不可用")
		return
	}
	s.json(w, 200, map[string]any{"creditName": c.CreditName, "creditScale": creditScale, "registrationEnabled": c.RegistrationEnabled, "registrationInviteRequired": c.RegistrationInviteRequired})
}

func (s *Service) audit(actor, action, target, detail string) {
	if s.db != nil {
		if _, err := s.db.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,$2,$3,$4)", actor, action, target, detail); err != nil {
			fmt.Printf("audit storage failed: %v\n", err)
		}
	}
}

func (s *Service) accountHandler(w http.ResponseWriter, r *http.Request) {
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
	// Reuse the existing read-only pagination snapshot, scoped to the current user.
	tx, page, err := s.beginAdminPage(r, "SELECT count(*) FROM credit_ledger WHERE user_id=$1", u.ID)
	if err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "流水暂时不可用")
		return
	}
	defer tx.Rollback()
	if err = tx.QueryRowContext(r.Context(), "SELECT available,held FROM credit_accounts WHERE user_id=$1", u.ID).Scan(&available, &held); err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "账户暂时不可用")
		return
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT id,kind,available_delta,held_delta,available_after,held_after,task_id,note,created_at FROM credit_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3`, u.ID, page.PageSize, page.offset())
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
	if err = rows.Close(); err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "流水暂时不可用")
		return
	}
	response := page.response("ledger", ledger)
	var storageBytes, estimatedBytes int64
	if err = s.db.QueryRow("SELECT account_storage_bytes($1),COALESCE((SELECT sum(storage_bytes) FROM prompt_reverse_tasks WHERE user_id=$1 AND storage_estimated),0)", u.ID).Scan(&storageBytes, &estimatedBytes); err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "存储用量暂时不可用")
		return
	}
	response["storage"] = map[string]int64{"usedBytes": storageBytes, "limitBytes": c.AccountStorageLimitBytes, "estimatedTemporaryBytes": estimatedBytes}
	response["user"] = map[string]string{"id": u.ID, "username": u.Username, "role": u.Role}
	response["available"], response["held"] = available, held
	response["creditName"], response["creditScale"] = c.CreditName, creditScale
	s.json(w, 200, response)
}

func (s *Service) allowAuthAttempt(r *http.Request) bool {
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

func (s *Service) requireAuxiliaryUser(w http.ResponseWriter, r *http.Request) bool {
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
