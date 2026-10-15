package studio

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/istudio/server/internal/idgen"
	objectstore "github.com/istudio/server/internal/storage"
)

func (s *Service) adminStorage(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		rows, err := s.db.Query("SELECT id FROM storage_profiles ORDER BY created_at,id")
		if err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储配置读取失败")
			return
		}
		ids := []string{}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				break
			}
			ids = append(ids, id)
		}
		readErr := rows.Err()
		rows.Close()
		if err != nil || readErr != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储配置读取失败")
			return
		}
		profiles := []objectstore.Profile{}
		for _, id := range ids {
			p, _, err := s.LoadProfile(id)
			if err != nil {
				s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储密钥无法读取，请检查加密密钥是否恢复")
				return
			}
			profiles = append(profiles, p)
		}
		var active string
		if s.db.QueryRow("SELECT active_profile FROM storage_settings WHERE id=true").Scan(&active) != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储配置读取失败")
			return
		}
		s.json(w, 200, map[string]any{"activeProfile": active, "profiles": profiles})
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		objectstore.Profile
		objectstore.Secrets
		ActiveProfile *string `json:"activeProfile"`
	}
	if !decode(r, &input) {
		s.error(w, 400, "STORAGE_CONFIG_INVALID", "配置格式错误")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	var current string
	if tx.QueryRow("SELECT active_profile FROM storage_settings WHERE id=true FOR UPDATE").Scan(&current) != nil {
		s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
		return
	}
	if input.ActiveProfile != nil {
		id := *input.ActiveProfile
		if id != "local" {
			if _, _, err = s.LoadProfile(id); err != nil {
				s.error(w, 400, "STORAGE_PROFILE_NOT_FOUND", "存储配置不存在")
				return
			}
		}
		if _, err = tx.Exec("UPDATE storage_settings SET active_profile=$1 WHERE id=true", id); err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "切换失败")
			return
		}
	} else {
		p := input.Profile
		secrets := input.Secrets
		p.Endpoint = strings.TrimRight(strings.TrimSpace(p.Endpoint), "/")
		p.PublicEndpoint = strings.TrimRight(strings.TrimSpace(p.PublicEndpoint), "/")
		p.CDNDomain = strings.TrimRight(strings.TrimSpace(p.CDNDomain), "/")
		if p.ID != "" {
			prior, priorSecrets, err := s.LoadProfile(p.ID)
			if err != nil {
				s.error(w, 404, "STORAGE_PROFILE_NOT_FOUND", "存储配置不存在")
				return
			}
			if prior.Provider != p.Provider || prior.Bucket != p.Bucket || prior.Region != p.Region || prior.Endpoint != p.Endpoint || prior.Prefix != p.Prefix || prior.PathStyle != p.PathStyle {
				s.error(w, 409, "STORAGE_LOCATION_IMMUTABLE", "存储位置不可修改，请新建配置再切换，以保留旧图片访问")
				return
			}
			if secrets.AccessKey == "" {
				secrets.AccessKey = priorSecrets.AccessKey
			}
			if secrets.SecretKey == "" {
				secrets.SecretKey = priorSecrets.SecretKey
			}
			if secrets.CDNKey == "" {
				secrets.CDNKey = priorSecrets.CDNKey
			}
		} else {
			p.ID = "store_" + idgen.New()
		}
		if _, err = objectstore.NewCloud(p, secrets); err != nil {
			s.error(w, 400, "STORAGE_CONFIG_INVALID", err.Error())
			return
		}
		if p.CDNDomain != "" && p.CDNMode != "qiniu_private" && secrets.CDNKey == "" {
			s.error(w, 400, "STORAGE_CONFIG_INVALID", "请配置 CDN 鉴权密钥")
			return
		}
		plain, _ := json.Marshal(secrets)
		encrypted, err := newAIConfigStore(s).encrypt("storage:"+p.ID, string(plain))
		if err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "密钥加密失败")
			return
		}
		raw, _ := json.Marshal(p)
		if _, err = tx.Exec("INSERT INTO storage_profiles(id,config,secrets_encrypted) VALUES($1,$2::jsonb,$3) ON CONFLICT(id) DO UPDATE SET config=EXCLUDED.config,secrets_encrypted=EXCLUDED.secrets_encrypted", p.ID, raw, encrypted); err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
		return
	}
	u, _ := s.currentAdministrator(r)
	s.audit(u.ID, "storage.update", "storage", "存储配置已更新")
	s.json(w, 200, map[string]any{"saved": true})
}
