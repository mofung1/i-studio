package auth

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
)

func TestTokenVerification(t *testing.T) {
	secret := []byte("test-secret")
	token := Sign(secret, domain.User{ID: "user-1", Username: "demo"})
	payload, ok := Verify(secret, token)
	if !ok || payload["sub"] != "user-1" {
		t.Fatalf("expected a valid token, got %#v, %v", payload, ok)
	}
}

func TestDefaultAuthSecretIsRandomAndPersists(t *testing.T) {
	t.Setenv("AUTH_JWT_SECRET", "")
	root := t.TempDir()
	first, err := LoadSecret(root)
	if err != nil || len(first) != 32 {
		t.Fatalf("load key: %v", err)
	}
	second, err := LoadSecret(root)
	if err != nil || !bytes.Equal(first, second) {
		t.Fatal("auth key changed after reload")
	}
	other, err := LoadSecret(t.TempDir())
	if err != nil || bytes.Equal(first, other) {
		t.Fatal("different installs share an auth key")
	}
}

func TestExpiredTokenIsRejected(t *testing.T) {
	secret := []byte("test-secret")
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"user-1","exp":%d}`, time.Now().Add(-time.Minute).Unix())))
	token := payload + "." + signPayload(payload, secret)
	if _, ok := Verify(secret, token); ok {
		t.Fatal("expected expired token to be rejected")
	}
}

func signPayload(payload string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
