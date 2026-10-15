package auth

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
)

// 未提供签名密钥时创建持久化随机密钥，避免所有默认部署共享同一个令牌密钥。
func LoadSecret(root string) ([]byte, error) {
	if configured := os.Getenv("AUTH_JWT_SECRET"); configured != "" {
		return []byte(configured), nil
	}
	path := filepath.Join(root, ".auth", "signing.key")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	if key, err := os.ReadFile(path); err == nil {
		if len(key) != 32 {
			return nil, fmt.Errorf("invalid auth signing key file")
		}
		return key, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if os.IsExist(err) {
		return LoadSecret(root)
	}
	if err != nil {
		return nil, err
	}
	_, writeErr := file.Write(key)
	closeErr := file.Close()
	if writeErr != nil {
		return nil, writeErr
	}
	return key, closeErr
}
