package main

import (
	"bytes"
	"io"
	"path/filepath"
	"testing"
)

func TestLocalStorageSupportsNestedKeys(t *testing.T) {
	storage := newLocalStorage(t.TempDir())
	key := filepath.Join("20260919", "nested", "test.png")
	want := []byte("image-data")
	if err := storage.Save(key, bytes.NewReader(want)); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	file, err := storage.Open(key)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	got, err := io.ReadAll(file)
	_ = file.Close()
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("Open() = %q, want %q", got, want)
	}
	if err := storage.Delete(key); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := storage.Open(key); err == nil {
		t.Fatal("Open() succeeded after Delete()")
	}
}

func TestLocalStorageRejectsPathTraversal(t *testing.T) {
	storage := newLocalStorage(t.TempDir())
	if err := storage.Save(filepath.Join("..", "outside.txt"), bytes.NewReader([]byte("nope"))); err == nil {
		t.Fatal("Save() accepted a path outside the storage root")
	}
	if _, err := storage.Open(filepath.Join("..", "outside.txt")); err == nil {
		t.Fatal("Open() accepted a path outside the storage root")
	}
}
