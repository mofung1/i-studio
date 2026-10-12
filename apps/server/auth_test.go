package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"testing"
	"time"
)

func TestTokenVerification(t *testing.T) {
	server := &server{secret: []byte("test-secret")}
	token := server.token(user{ID: "user-1", Username: "demo"})
	payload, ok := server.verify(token)
	if !ok || payload["sub"] != "user-1" {
		t.Fatalf("expected a valid token, got %#v, %v", payload, ok)
	}
}

func TestDefaultAuthSecretIsRandomAndPersists(t *testing.T) {
	t.Setenv("AUTH_JWT_SECRET", "")
	root := t.TempDir()
	first, err := loadAuthSecret(root)
	if err != nil || len(first) != 32 {
		t.Fatalf("load key: %v", err)
	}
	second, err := loadAuthSecret(root)
	if err != nil || !bytes.Equal(first, second) {
		t.Fatal("auth key changed after reload")
	}
	other, err := loadAuthSecret(t.TempDir())
	if err != nil || bytes.Equal(first, other) {
		t.Fatal("different installs share an auth key")
	}
}

func TestExpiredTokenIsRejected(t *testing.T) {
	server := &server{secret: []byte("test-secret")}
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"user-1","exp":%d}`, time.Now().Add(-time.Minute).Unix())))
	token := payload + "." + signPayload(payload, server.secret)
	if _, ok := server.verify(token); ok {
		t.Fatal("expected expired token to be rejected")
	}
}
