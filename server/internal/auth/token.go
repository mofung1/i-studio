// Package auth handles credentials and signing, independent of account persistence.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
)

func Sign(secret []byte, u domain.User) string {
	return SignForAudience(secret, u, "web")
}

func SignForAudience(secret []byte, u domain.User, audience string) string {
	lifetime := 7 * 24 * time.Hour
	if audience == "admin" {
		lifetime = 8 * time.Hour
	}
	raw, _ := json.Marshal(map[string]any{"sub": u.ID, "username": u.Username, "ver": u.AuthVersion, "aud": audience, "exp": time.Now().Add(lifetime).Unix()})
	payload := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func Verify(secret []byte, token string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(parts[0]))
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, false
	}
	var p map[string]any
	if json.Unmarshal(raw, &p) != nil {
		return nil, false
	}
	expiresAt, ok := p["exp"].(float64)
	if !ok {
		return nil, false
	}
	if expiresAt > 1_000_000_000_000 {
		expiresAt /= 1000
	}
	if time.Now().Unix() >= int64(expiresAt) {
		return nil, false
	}
	return p, true
}
