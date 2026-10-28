package storage

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type unifiedProfileSource struct {
	active   string
	profiles map[string]Profile
}

func (s *unifiedProfileSource) ActiveProfile() (string, error) { return s.active, nil }
func (s *unifiedProfileSource) LoadProfile(id string) (Profile, Secrets, error) {
	return s.profiles[id], Secrets{AccessKey: "fixture-access", SecretKey: "fixture-secret"}, nil
}

func TestUnifiedStorageMirrorsLocalAndSwitchesHistoricalKeys(t *testing.T) {
	local := NewLocal(t.TempDir())
	source := &unifiedProfileSource{active: "a", profiles: map[string]Profile{}}
	router := NewRouter(local, source)
	router.clients = map[string]*Cloud{}
	var uploaded string
	for _, id := range []string{"a", "b"} {
		p := cloudFixture("qiniu")
		p.ID = id
		p.CDNDomain = "https://" + id + ".example.com"
		p.CDNMode = "qiniu_private"
		source.profiles[id] = p
		client, err := NewCloudWithClient(p, Secrets{AccessKey: "fixture-access", SecretKey: "fixture-secret"}, &http.Client{Transport: storageTransport(func(r *http.Request) (*http.Response, error) {
			if r.Method == "PUT" {
				data, _ := io.ReadAll(r.Body)
				uploaded = string(data)
			}
			return &http.Response{StatusCode: 200, Header: http.Header{"Etag": []string{`"fixture"`}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
		})})
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(p)
		router.clients[string(raw)] = client
	}
	key := router.NewKey("user/20261028/photo.png")
	if key != "user/20261028/photo.png" {
		t.Fatal("provider leaked into key", key)
	}
	if err := router.Save(key, strings.NewReader("image-data")); err != nil {
		t.Fatal(err)
	}
	file, err := local.Open(key)
	if err != nil {
		t.Fatal("missing local mirror", err)
	}
	data, _ := io.ReadAll(file)
	file.Close()
	if uploaded != "image-data" || string(data) != uploaded {
		t.Fatal("local/cloud mismatch")
	}
	for _, id := range []string{"a", "b"} {
		source.active = id
		for _, reference := range []string{key, "@storage/old-provider/" + key} {
			url, err := router.SignedURL(reference, time.Minute)
			if err != nil || !strings.HasPrefix(url, "https://"+id+".example.com/studio/user/") {
				t.Fatal("historical key did not follow current config", url, err)
			}
		}
	}
	source.active = "local"
	if url, err := router.SignedURL(key, time.Minute); err != nil || url != "" {
		t.Fatal(url, err)
	}
	file, err = router.Open("@storage/old-provider/" + key)
	if err != nil {
		t.Fatal("local rollback failed", err)
	}
	file.Close()
}
