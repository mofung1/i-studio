package studio

import (
	"net/http"
	"strings"

	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
)

func (s *Service) currentAdministrator(r *http.Request) (domain.User, bool) {
	payload, ok := s.verify(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if !ok || payload["aud"] != "admin" {
		return domain.User{}, false
	}
	id, _ := payload["sub"].(string)
	if id == "" {
		return domain.User{}, false
	}
	if s.db != nil {
		var u domain.User
		err := s.db.QueryRow("SELECT id,username,role,status,auth_version FROM admin_users WHERE id=$1", id).Scan(&u.ID, &u.Username, &u.Role, &u.Status, &u.AuthVersion)
		return u, err == nil && u.Status == "active" && authn.VersionMatches(payload, u)
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.administrators {
		if u.ID == id {
			return u, u.Status == "active" && authn.VersionMatches(payload, u)
		}
	}
	return domain.User{}, false
}

func (s *Service) adminLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.allowAuthAttempt(r) {
		s.error(w, 429, "AUTH_RATE_LIMIT", "登录请求过多，请 15 分钟后重试")
		return
	}
	var input struct{ Username, Password string }
	if !decode(r, &input) || !authn.ValidUsername(strings.ToLower(strings.TrimSpace(input.Username))) || !authn.ValidAdministratorPassword(input.Password) {
		s.error(w, 400, "AUTH_INPUT_INVALID", "请填写有效的管理员用户名和密码")
		return
	}
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "运营后台需要 PostgreSQL 数据库")
		return
	}
	var u domain.User
	err := s.db.QueryRow("SELECT id,username,password_hash,role,status,auth_version FROM admin_users WHERE username=$1", strings.ToLower(strings.TrimSpace(input.Username))).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.Status, &u.AuthVersion)
	if err != nil || !authn.CheckPassword(input.Password, u.PasswordHash) {
		s.error(w, 401, "INVALID_CREDENTIALS", "管理员用户名或密码错误")
		return
	}
	if u.Status != "active" {
		s.error(w, 403, "ACCOUNT_DISABLED", "管理员账号已停用")
		return
	}
	s.audit(u.ID, "admin.login", u.ID, "管理员登录后台")
	s.json(w, 200, map[string]any{"accessToken": authn.SignForAudience(s.secret, u, "admin"), "user": map[string]string{"id": u.ID, "username": u.Username, "role": "admin"}})
}

func (s *Service) adminMe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	u, ok := s.currentAdministrator(r)
	if !ok {
		s.json(w, 200, map[string]any{"authenticated": false})
		return
	}
	config, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "后台会话暂时无法读取，请重试")
		return
	}
	s.json(w, 200, map[string]any{"authenticated": true, "user": map[string]string{"id": u.ID, "username": u.Username, "role": "admin"}, "creditName": config.CreditName})
}
