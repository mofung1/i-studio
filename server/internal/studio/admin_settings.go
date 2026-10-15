package studio

import (
	"encoding/json"
	"net/http"
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
	u, _ := s.currentAdministrator(r)
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
