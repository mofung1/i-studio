package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const storageProfilesMigration = `
CREATE TABLE IF NOT EXISTS storage_deletions(storage_key TEXT PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, next_attempt TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS storage_profiles(id TEXT PRIMARY KEY, config JSONB NOT NULL, secrets_encrypted TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS storage_settings(id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id), active_profile TEXT NOT NULL DEFAULT 'local');
INSERT INTO storage_settings(id) VALUES(true) ON CONFLICT DO NOTHING;`

// Unqualified keys always belong to the original local store. Changing the
// default must never reinterpret an existing key against another bucket.
type profileStorage struct {
	server  *server
	local   objectStorage
	mu      sync.Mutex
	clients map[string]*cloudStorage
}

func (s *server) newStorageKey(key string) string {
	if router, ok := s.storage.(*profileStorage); ok {
		var id string
		if router.server.db.QueryRow("SELECT active_profile FROM storage_settings WHERE id=true").Scan(&id) != nil {
			return "@storage/unavailable/" + key
		}
		if id != "local" {
			return "@storage/" + id + "/" + key
		}
	}
	return key
}
func (s *profileStorage) resolve(key string) (objectStorage, string, error) {
	if !strings.HasPrefix(key, "@storage/") {
		return s.local, key, nil
	}
	rest := strings.TrimPrefix(key, "@storage/")
	id, object, ok := strings.Cut(rest, "/")
	if !ok || id == "" || object == "" {
		return nil, "", fmt.Errorf("invalid storage reference")
	}
	p, secrets, err := s.server.loadStorageProfile(id)
	if err != nil {
		return nil, "", fmt.Errorf("storage profile unavailable")
	}
	encoded, _ := json.Marshal(p)
	fingerprint := string(encoded) + p.EncryptedSecrets
	s.mu.Lock()
	defer s.mu.Unlock()
	client := s.clients[fingerprint]
	if client == nil {
		client, err = newCloudStorage(p, secrets)
		if err != nil {
			return nil, "", err
		}
		if s.clients == nil {
			s.clients = map[string]*cloudStorage{}
		}
		// Config updates are uncommon; bound retained SDK clients.
		if len(s.clients) > 32 {
			s.clients = map[string]*cloudStorage{}
		}
		s.clients[fingerprint] = client
	}
	return client, object, nil
}
func (s *profileStorage) Save(key string, r io.Reader) error {
	store, key, err := s.resolve(key)
	if err != nil {
		return err
	}
	return store.Save(key, r)
}
func (s *profileStorage) Open(key string) (io.ReadCloser, error) {
	store, key, err := s.resolve(key)
	if err != nil {
		return nil, err
	}
	return store.Open(key)
}
func (s *profileStorage) Delete(key string) error {
	store, key, err := s.resolve(key)
	if err != nil {
		return err
	}
	return store.Delete(key)
}
func (s *profileStorage) SignedURL(key string, ttl time.Duration) (string, error) {
	store, key, err := s.resolve(key)
	if err != nil {
		return "", err
	}
	if signer, ok := store.(signedObjectStorage); ok {
		return signer.SignedURL(key, ttl)
	}
	return "", nil
}
func (s *server) loadStorageProfile(id string) (storageProfile, storageSecrets, error) {
	var p storageProfile
	var secrets storageSecrets
	var raw []byte
	err := s.db.QueryRow("SELECT config,secrets_encrypted FROM storage_profiles WHERE id=$1", id).Scan(&raw, &p.EncryptedSecrets)
	if err != nil {
		return p, secrets, err
	}
	if err = json.Unmarshal(raw, &p); err != nil {
		return p, secrets, err
	}
	p.ID = id
	cipher := newAIConfigStore(s)
	plain, err := cipher.decrypt(endpointConfig{ID: "storage:" + id, APIKeyEncrypted: p.EncryptedSecrets})
	if err != nil {
		return p, secrets, err
	}
	err = json.Unmarshal([]byte(plain), &secrets)
	p.HasCredentials = secrets.AccessKey != "" && secrets.SecretKey != ""
	p.HasCDNKey = secrets.CDNKey != ""
	return p, secrets, err
}
func (s *server) adminStorage(w http.ResponseWriter, r *http.Request) {
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
		profiles := []storageProfile{}
		for _, id := range ids {
			p, _, err := s.loadStorageProfile(id)
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
		storageProfile
		storageSecrets
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
			if _, _, err = s.loadStorageProfile(id); err != nil {
				s.error(w, 400, "STORAGE_PROFILE_NOT_FOUND", "存储配置不存在")
				return
			}
		}
		if _, err = tx.Exec("UPDATE storage_settings SET active_profile=$1 WHERE id=true", id); err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "切换失败")
			return
		}
	} else {
		p := input.storageProfile
		secrets := input.storageSecrets
		p.Endpoint = strings.TrimRight(strings.TrimSpace(p.Endpoint), "/")
		p.PublicEndpoint = strings.TrimRight(strings.TrimSpace(p.PublicEndpoint), "/")
		p.CDNDomain = strings.TrimRight(strings.TrimSpace(p.CDNDomain), "/")
		if p.ID != "" {
			prior, priorSecrets, err := s.loadStorageProfile(p.ID)
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
			p.ID = "store_" + randomID()
		}
		if _, err = newCloudStorage(p, secrets); err != nil {
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
	u, _ := s.currentUser(r)
	s.audit(u.ID, "storage.update", "storage", "存储配置已更新")
	s.json(w, 200, map[string]any{"saved": true})
}

// The API checks ownership before issuing any signed URL. Do not replace a
// presigned origin URL's hostname: CDN has a separate authentication protocol.
func (s *server) redirectStoredObject(w http.ResponseWriter, r *http.Request, key string) bool {
	signer, ok := s.storage.(signedObjectStorage)
	if !ok {
		return false
	}
	target, err := signer.SignedURL(key, 5*time.Minute)
	if err != nil {
		s.error(w, 503, "STORAGE_UNAVAILABLE", "图片存储暂时不可用，请稍后重试")
		return true
	}
	if target == "" {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, target, http.StatusFound)
	return true
}
