package studio

import (
	"net/http"
	"strings"

	authn "github.com/istudio/server/internal/auth"
	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

func (s *Service) register(w http.ResponseWriter, r *http.Request) { s.auth(w, r, true) }

func (s *Service) login(w http.ResponseWriter, r *http.Request) { s.auth(w, r, false) }

func (s *Service) auth(w http.ResponseWriter, r *http.Request, create bool) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if !s.allowAuthAttempt(r) {
		s.error(w, 429, "AUTH_RATE_LIMIT", "登录或注册请求过多，请 15 分钟后重试")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(r, &body) {
		s.error(w, 400, "AUTH_INPUT_INVALID", "用户名需为 3-32 位，密码至少 8 位")
		return
	}
	name := strings.ToLower(strings.TrimSpace(body.Username))
	if !authn.ValidUsername(name) || len(body.Password) < 8 || len(body.Password) > 128 {
		s.error(w, 400, "AUTH_INPUT_INVALID", "用户名需为 3-32 位字母、数字或下划线，密码需为 8-128 位")
		return
	}
	if s.db != nil {
		u, exists, err := repository.UserByUsername(s.db, name)
		if err != nil {
			s.error(w, 500, "AUTH_STORAGE_ERROR", "账号服务暂时不可用")
			return
		}
		if create {
			config, err := s.operationSettings()
			if err != nil {
				s.error(w, 503, "AUTH_STORAGE_ERROR", "注册服务暂时不可用")
				return
			}
			if !config.RegistrationEnabled {
				s.error(w, 403, "REGISTRATION_CLOSED", "网站暂未开放注册")
				return
			}
			if exists {
				s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
				return
			}
			u = domain.User{ID: idgen.New(), Username: name, PasswordHash: authn.HashPassword(body.Password)}
			if err := s.registerAccount(u, config.SignupGiftMinor); err != nil {
				s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
				return
			}
		} else if !exists || !authn.CheckPassword(body.Password, u.PasswordHash) {
			s.error(w, 401, "INVALID_CREDENTIALS", "用户名或密码错误")
			return
		}
		if u.Status == "disabled" {
			s.error(w, 403, "ACCOUNT_DISABLED", "账号已停用，请联系管理员")
			return
		}
		s.json(w, 200, map[string]any{"accessToken": s.token(u), "user": map[string]string{"id": u.ID, "username": u.Username}})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	u, exists := s.users[name]
	if create {
		if exists {
			s.error(w, 409, "USERNAME_EXISTS", "用户名已存在")
			return
		}
		u = domain.User{ID: idgen.New(), Username: name, PasswordHash: authn.HashPassword(body.Password)}
		s.users[name] = u
	} else if !exists || !authn.CheckPassword(body.Password, u.PasswordHash) {
		s.error(w, 401, "INVALID_CREDENTIALS", "用户名或密码错误")
		return
	}
	s.json(w, 200, map[string]any{"accessToken": s.token(u), "user": map[string]string{"id": u.ID, "username": u.Username}})
}

func (s *Service) me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	u, ok := s.currentUser(r)
	if !ok {
		s.json(w, 200, map[string]any{"authenticated": false})
		return
	}
	config, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "ACCOUNT_UNAVAILABLE", "账户暂时不可用")
		return
	}
	var available, held int64
	if s.db != nil {
		if err = s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id=$1", u.ID).Scan(&available, &held); err != nil {
			s.error(w, 503, "ACCOUNT_UNAVAILABLE", "余额暂时不可用")
			return
		}
	}
	s.json(w, 200, map[string]any{"authenticated": true, "user": map[string]string{"id": u.ID, "sub": u.ID, "username": u.Username, "role": u.Role}, "available": available, "held": held, "creditName": config.CreditName, "creditScale": creditScale})
}

func (s *Service) authenticatedUserID(r *http.Request) (string, bool) {
	u, ok := s.currentUser(r)
	return u.ID, ok
}
