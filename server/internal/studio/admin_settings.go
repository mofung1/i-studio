package studio

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
)

func (s *Service) adminSettings(w http.ResponseWriter, r *http.Request) {
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
	current, err := s.operationSettings()
	if err != nil {
		s.error(w, 503, "SETTINGS_UNAVAILABLE", "配置读取失败")
		return
	}
	input := struct {
		operationSettings
		RegistrationInviteCode string `json:"registrationInviteCode"`
	}{operationSettings: current}
	if !decode(r, &input) {
		s.error(w, 400, "SETTINGS_INVALID", "配置格式错误")
		return
	}
	c := input.operationSettings
	c.CreditName = strings.TrimSpace(c.CreditName)
	if !validOperationSettings(c) {
		s.error(w, 400, "SETTINGS_INVALID", "请检查积分名称、金额和请求上限")
		return
	}
	if input.RegistrationInviteCode != "" && !regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`).MatchString(input.RegistrationInviteCode) {
		s.error(w, 400, "INVITE_INVALID", "邀请码需为 8–64 位字母、数字、下划线或短横线")
		return
	}
	raw, _ := json.Marshal(c)
	u, _ := s.currentAdministrator(r)
	tx, err := s.db.Begin()
	if err == nil {
		defer tx.Rollback()
		if input.RegistrationInviteCode != "" {
			_, err = tx.Exec("INSERT INTO registration_invite(id,code_hash) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET code_hash=EXCLUDED.code_hash", inviteHash(input.RegistrationInviteCode))
		}
		var configured bool
		if err == nil {
			err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM registration_invite WHERE id=true)").Scan(&configured)
		}
		if err == nil && c.RegistrationInviteRequired && !configured {
			s.error(w, 400, "INVITE_REQUIRED", "启用邀请注册前请设置邀请码")
			return
		}
		c.RegistrationInviteConfigured = configured
		raw, _ = json.Marshal(c)
		if err == nil {
			_, err = tx.Exec("UPDATE operation_settings SET config=$1::jsonb WHERE id=true", raw)
		}
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
