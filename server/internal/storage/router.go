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

func NewRouter(local Store, source ProfileSource) *Router {
	return &Router{local: local, source: source}
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
	source  ProfileSource
	local   Store
	mu      sync.Mutex
	clients map[string]*Cloud
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
	store, key, err := s.resolve(key)
	if err != nil {
		return err
	}
	return store.Save(key, r)
}

func (s *Router) Open(key string) (io.ReadCloser, error) {
	store, key, err := s.resolve(key)
	if err != nil {
		return nil, err
	}
	return store.Open(key)
}

func (s *Router) Delete(key string) error {
	store, key, err := s.resolve(key)
	if err != nil {
		return err
	}
	return store.Delete(key)
}

func (s *Router) SignedURL(key string, ttl time.Duration) (string, error) {
	store, key, err := s.resolve(key)
	if err != nil {
		return "", err
	}
	if signer, ok := store.(SignedStore); ok {
		return signer.SignedURL(key, ttl)
	}
	return "", nil
}
