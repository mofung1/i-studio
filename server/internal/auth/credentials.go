package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"encoding/base64"
	"strings"

	"golang.org/x/crypto/argon2"

	"github.com/istudio/server/internal/domain"
)

func VersionMatches(payload map[string]any, u domain.User) bool {
	version, exists := payload["ver"]
	if !exists {
		return u.AuthVersion == 0 // Existing sessions remain valid until credentials change.
	}
	number, ok := version.(float64)
	return ok && number >= 0 && number == float64(u.AuthVersion)
}

func ValidUsername(value string) bool {
	if len(value) < 3 || len(value) > 32 {
		return false
	}
	for _, character := range value {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '_' {
			return false
		}
	}
	return true
}

func ValidAdministratorPassword(value string) bool {
	return len(value) >= 6 && len(value) <= 128 && strings.TrimSpace(value) != "" && !strings.ContainsAny(value, "\x00\r\n")
}

func HashPassword(password string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return base64.RawStdEncoding.EncodeToString(salt) + ":" + base64.RawStdEncoding.EncodeToString(key)
}

func CheckPassword(password, stored string) bool {
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return false
	}
	salt, saltErr := base64.RawStdEncoding.DecodeString(parts[0])
	expected, keyErr := base64.RawStdEncoding.DecodeString(parts[1])
	if saltErr != nil || keyErr != nil || len(salt) != 16 || len(expected) != 32 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return hmac.Equal(expected, actual)
}
