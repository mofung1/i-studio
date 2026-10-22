package storage

import (
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

type observerStore struct {
	failure error
	stream  io.ReadCloser
}

func (s observerStore) Save(string, io.Reader) error                    { return s.failure }
func (s observerStore) Delete(string) error                             { return s.failure }
func (s observerStore) Open(string) (io.ReadCloser, error)              { return s.stream, s.failure }
func (s observerStore) SignedURL(string, time.Duration) (string, error) { return "", s.failure }

type brokenReadCloser struct{ err error }

func (r brokenReadCloser) Read([]byte) (int, error) { return 0, r.err }
func (r brokenReadCloser) Close() error             { return r.err }

func TestRouterObservesFailuresWithoutChangingResults(t *testing.T) {
	failure := errors.New("upstream failure")
	var operations []string
	router := NewRouter(observerStore{failure: failure}, nil, func(operation, key string) {
		if key != "image.png" {
			t.Fatal("object key changed", key)
		}
		operations = append(operations, operation)
	})
	if err := router.Save("image.png", strings.NewReader("data")); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if _, err := router.Open("image.png"); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if err := router.Delete("image.png"); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if _, err := router.SignedURL("image.png", time.Minute); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if strings.Join(operations, ",") != "save,open,delete,sign" {
		t.Fatal(operations)
	}
}

func TestRouterObservesReadAndCloseFailureOnceButNotEOF(t *testing.T) {
	for _, broken := range []bool{false, true} {
		calls := 0
		var file io.ReadCloser = io.NopCloser(strings.NewReader("data"))
		if broken {
			file = brokenReadCloser{errors.New("broken response body")}
		}
		router := NewRouter(observerStore{stream: file}, nil, func(operation, key string) {
			calls++
			if operation != "read" {
				t.Fatal(operation)
			}
		})
		reader, err := router.Open("image.png")
		if err != nil {
			t.Fatal(err)
		}
		_, readErr := io.ReadAll(reader)
		closeErr := reader.Close()
		if broken && (readErr == nil || closeErr == nil || calls != 1) {
			t.Fatal(readErr, closeErr, calls)
		}
		if !broken && (readErr != nil || closeErr != nil || calls != 0) {
			t.Fatal(readErr, closeErr, calls)
		}
	}
}
