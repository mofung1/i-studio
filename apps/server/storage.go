package main

import (
	"io"
	"os"
	"path/filepath"
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
func (s *localStorage) Save(key string, source io.Reader) error {
	file, err := os.Create(filepath.Join(s.root, key))
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = io.Copy(file, source)
	return err
}
func (s *localStorage) Open(key string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(s.root, key))
}
func (s *localStorage) Delete(key string) error {
	err := os.Remove(filepath.Join(s.root, key))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
