package storage

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"
)

type ProfileSource interface {
	ActiveProfile() (string, error)
	LoadProfile(id string) (Profile, Secrets, error)
}

// The optional observer is fixed before the router is shared by workers.
func NewRouter(local Store, source ProfileSource, observer ...func(operation, key string)) *Router {
	router := &Router{local: local, source: source}
	if len(observer) > 0 {
		router.onFailure = observer[0]
	}
	return router
}

func (s *Router) NewKey(key string) string {
	id, err := s.source.ActiveProfile()
	if err != nil {
		return "@storage/unavailable/" + key
	}
	if id != "local" {
		return "@storage/" + id + "/" + key
	}
	return key
}

// Unqualified keys always belong to the original local store. Changing the
// default must never reinterpret an existing key against another bucket.
type Router struct {
	source    ProfileSource
	local     Store
	mu        sync.Mutex
	clients   map[string]*Cloud
	onFailure func(operation, key string)
}

func (s *Router) resolve(key string) (Store, string, error) {
	if !strings.HasPrefix(key, "@storage/") {
		return s.local, key, nil
	}
	rest := strings.TrimPrefix(key, "@storage/")
	id, object, ok := strings.Cut(rest, "/")
	if !ok || id == "" || object == "" {
		return nil, "", fmt.Errorf("invalid storage reference")
	}
	p, secrets, err := s.source.LoadProfile(id)
	if err != nil {
		return nil, "", fmt.Errorf("storage profile unavailable")
	}
	encoded, _ := json.Marshal(p)
	fingerprint := string(encoded) + p.EncryptedSecrets
	s.mu.Lock()
	defer s.mu.Unlock()
	client := s.clients[fingerprint]
	if client == nil {
		client, err = NewCloud(p, secrets)
		if err != nil {
			return nil, "", err
		}
		if s.clients == nil {
			s.clients = map[string]*Cloud{}
		}
		// Config updates are uncommon; bound retained SDK clients.
		if len(s.clients) > 32 {
			s.clients = map[string]*Cloud{}
		}
		s.clients[fingerprint] = client
	}
	return client, object, nil
}

func (s *Router) Save(key string, r io.Reader) error {
	store, object, err := s.resolve(key)
	if err == nil {
		err = store.Save(object, r)
	}
	s.observe("save", key, err)
	return err
}

func (s *Router) Open(key string) (io.ReadCloser, error) {
	store, object, err := s.resolve(key)
	var file io.ReadCloser
	if err == nil {
		file, err = store.Open(object)
	}
	s.observe("open", key, err)
	if err != nil || s.onFailure == nil {
		return file, err
	}
	return &observedReader{ReadCloser: file, report: func() { s.onFailure("read", key) }}, nil
}

func (s *Router) Delete(key string) error {
	store, object, err := s.resolve(key)
	if err == nil {
		err = store.Delete(object)
	}
	s.observe("delete", key, err)
	return err
}

func (s *Router) SignedURL(key string, ttl time.Duration) (string, error) {
	store, object, err := s.resolve(key)
	if err != nil {
		s.observe("sign", key, err)
		return "", err
	}
	if signer, ok := store.(SignedStore); ok {
		url, err := signer.SignedURL(object, ttl)
		s.observe("sign", key, err)
		return url, err
	}
	return "", nil
}

func (s *Router) observe(operation, key string, err error) {
	if err != nil && s.onFailure != nil {
		s.onFailure(operation, key)
	}
}

type observedReader struct {
	io.ReadCloser
	once   sync.Once
	report func()
}

func (r *observedReader) Read(p []byte) (int, error) {
	n, err := r.ReadCloser.Read(p)
	if err != nil && err != io.EOF {
		r.once.Do(r.report)
	}
	return n, err
}

func (r *observedReader) Close() error {
	err := r.ReadCloser.Close()
	if err != nil {
		r.once.Do(r.report)
	}
	return err
}
