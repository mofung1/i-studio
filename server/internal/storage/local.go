// Package storage implements local and cloud objects behind the same storage contract.
package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Store interface {
	Save(key string, source io.Reader) error
	Open(key string) (io.ReadCloser, error)
	Delete(key string) error
}

type Local struct{ root string }

func NewLocal(root string) *Local {
	_ = os.MkdirAll(root, 0o755)
	return &Local{root: root}
}

func (s *Local) path(key string) (string, error) {
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

func (s *Local) Save(key string, source io.Reader) error {
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

func (s *Local) Open(key string) (io.ReadCloser, error) {
	path, err := s.path(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

func (s *Local) Delete(key string) error {
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
