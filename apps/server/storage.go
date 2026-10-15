package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type objectStorage interface {
	Save(key string, source io.Reader) error
	Open(key string) (io.ReadCloser, error)
	Delete(key string) error
}

type localStorage struct{ root string }

func newLocalStorage(root string) *localStorage {
	_ = os.MkdirAll(root, 0o755)
	return &localStorage{root: root}
}

func (s *localStorage) path(key string) (string, error) {
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("storage key is empty")
	}
	if filepath.IsAbs(key) {
		return "", fmt.Errorf("storage key must be relative")
	}
	root, err := filepath.Abs(s.root)
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(root, filepath.Clean(key)))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("storage key escapes storage root")
	}
	return path, nil
}

func (s *localStorage) Save(key string, source io.Reader) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".image-write-*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if _, err = io.Copy(file, source); err != nil {
		_ = file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func (s *localStorage) Open(key string) (io.ReadCloser, error) {
	path, err := s.path(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *localStorage) Delete(key string) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *server) deleteAssetFiles(key string) error {
	if err := s.storage.Delete(key); err != nil {
		return err
	}
	if err := s.storage.Delete(key + ".thumbnail-v1.jpg"); err != nil {
		return err
	}
	if s.db != nil {
		_, err := s.db.Exec("DELETE FROM storage_deletions WHERE storage_key=$1", key)
		return err
	}
	return nil
}
