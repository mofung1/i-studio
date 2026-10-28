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
	return key
}

// Keys are relative to uploads, independent of the current cloud provider.
// Local remains a complete mirror so moving uploads and changing the active
// configuration also moves historical images without editing database rows.
type Router struct {
	source    ProfileSource
	local     Store
	mu        sync.Mutex
	clients   map[string]*Cloud
	onFailure func(operation, key string)
}

func RelativeKey(key string) (string, error) {
	if strings.HasPrefix(key, "@storage/") {
		id, object, ok := strings.Cut(strings.TrimPrefix(key, "@storage/"), "/")
		if !ok || id == "" || object == "" {
			return "", fmt.Errorf("invalid storage reference")
		}
		return object, nil
	}
	return key, nil
}

// DownloadSigner snapshots the current configuration once for a gallery page.
func (s *Router) DownloadSigner() (SignedStore, error) {
	if s.source == nil {
		signer, _ := s.local.(SignedStore)
		return signer, nil
	}
	id, err := s.source.ActiveProfile()
	if err != nil {
		return nil, err
	}
	if id == "local" {
		return nil, nil
	}
	return s.cloud(id)
}

func (s *Router) cloud(id string) (*Cloud, error) {
	p, secrets, err := s.source.LoadProfile(id)
	if err != nil {
		return nil, fmt.Errorf("storage profile unavailable")
	}
	encoded, _ := json.Marshal(p)
	fingerprint := string(encoded) + p.EncryptedSecrets
	s.mu.Lock()
	defer s.mu.Unlock()
	client := s.clients[fingerprint]
	if client == nil {
		client, err = NewCloud(p, secrets)
		if err != nil {
			return nil, err
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
	return client, nil
}

func (s *Router) Save(key string, r io.Reader) error {
	object, err := RelativeKey(key)
	if err == nil {
		err = s.local.Save(object, r)
	}
	if err == nil {
		var signer SignedStore
		signer, err = s.DownloadSigner()
		if cloud, ok := signer.(*Cloud); err == nil && ok {
			var file io.ReadCloser
			file, err = s.local.Open(object)
			if err == nil {
				err = cloud.Save(object, file)
				_ = file.Close()
			}
		}
	}
	s.observe("save", key, err)
	return err
}

func (s *Router) Open(key string) (io.ReadCloser, error) {
	object, err := RelativeKey(key)
	var file io.ReadCloser
	if err == nil {
		file, err = s.local.Open(object)
	}
	s.observe("open", key, err)
	if err != nil || s.onFailure == nil {
		return file, err
	}
	return &observedReader{ReadCloser: file, report: func() { s.onFailure("read", key) }}, nil
}

func (s *Router) Delete(key string) error {
	object, err := RelativeKey(key)
	if err == nil {
		var signer SignedStore
		signer, err = s.DownloadSigner()
		if cloud, ok := signer.(*Cloud); err == nil && ok {
			err = cloud.Delete(object)
		}
		if err == nil {
			err = s.local.Delete(object)
		}
	}
	s.observe("delete", key, err)
	return err
}

func (s *Router) SignedURL(key string, ttl time.Duration) (string, error) {
	object, err := RelativeKey(key)
	var signer SignedStore
	if err == nil {
		signer, err = s.DownloadSigner()
	}
	if err != nil {
		s.observe("sign", key, err)
		return "", err
	}
	if signer != nil {
		url, err := signer.SignedURL(object, ttl)
		s.observe("sign", key, err)
		return url, err
	}
	return "", nil
}

// CacheControl describes how long a client may reuse a redirect target. Local
// storage and signed private links must not be cached.
func (s *Router) CacheControl() string {
	signer, err := s.DownloadSigner()
	if err != nil {
		return ""
	}
	if cloud, ok := signer.(*Cloud); ok {
		return cloud.CacheControl()
	}
	return ""
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
