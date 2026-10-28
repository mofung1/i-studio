package studio

import (
	"encoding/json"
	"net/http"
	"time"

	objectstore "github.com/istudio/server/internal/storage"
)

func (s *Service) newStorageKey(key string) string {
	if router, ok := s.storage.(*objectstore.Router); ok {
		return router.NewKey(key)
	}
	return key
}

func (s *Service) ActiveProfile() (string, error) {
	var id string
	err := s.db.QueryRow("SELECT active_profile FROM storage_settings WHERE id=true").Scan(&id)
	return id, err
}

func (s *Service) LoadProfile(id string) (objectstore.Profile, objectstore.Secrets, error) {
	var p objectstore.Profile
	var secrets objectstore.Secrets
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

// The API checks ownership before issuing any signed URL. Do not replace a
// presigned origin URL's hostname: CDN has a separate authentication protocol.
//
// A public profile returns a stable unsigned link, so the redirect itself is
// cacheable and repeat views never reach the API. Private links expire in
// minutes and must not be cached anywhere.
func (s *Service) redirectStoredObject(w http.ResponseWriter, r *http.Request, key string) bool {
	signer, ok := s.storage.(objectstore.SignedStore)
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
	// Community covers keep the no-store they set before publishing is checked.
	if w.Header().Get("Cache-Control") == "" {
		cache := "no-store"
		if policy, ok := s.storage.(interface{ CacheControl() string }); ok {
			if value := policy.CacheControl(); value != "" {
				cache = value
			}
		}
		w.Header().Set("Cache-Control", cache)
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, target, http.StatusFound)
	return true
}
