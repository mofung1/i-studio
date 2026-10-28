package studio

import (
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

func TestStorageProfilesUnifyImagesAndShowSecretsOnlyToAdmin(t *testing.T) {
	s, _, _ := operationTestServer(t)
	s.storage = objectstore.NewLocal(t.TempDir())
	s.storage = objectstore.NewRouter(s.storage, s)
	if err := s.storage.Save("legacy.png", strings.NewReader("old-image")); err != nil {
		t.Fatal(err)
	}
	admin := s.testAdminToken(domain.User{ID: "operator"})
	member := s.testToken(domain.User{ID: "member"})
	input := map[string]any{"name": "七牛生产", "provider": "qiniu", "endpoint": "https://s3.cn-east-1.qiniucs.com", "region": "cn-east-1", "bucket": "fixture-bucket", "prefix": "studio", "accessKey": "fixture-access-key", "secretKey": "fixture-secret-key"}
	raw, _ := json.Marshal(input)
	w := operationRequest(s, "POST", "/v1/admin/storage", string(raw), member, s.router().ServeHTTP)
	if w.Code != 403 {
		t.Fatal("ordinary account configured storage", w.Code)
	}
	w = operationRequest(s, "POST", "/v1/admin/storage", string(raw), admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = operationRequest(s, "GET", "/v1/admin/storage", "", admin, s.router().ServeHTTP)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "fixture-access-key") || !strings.Contains(w.Body.String(), "fixture-secret-key") {
		t.Fatal("administrator could not read saved credentials", w.Code)
	}
	var config struct {
		Profiles []objectstore.Profile `json:"profiles"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &config)
	if len(config.Profiles) != 1 {
		t.Fatal("profile missing")
	}
	id := config.Profiles[0].ID
	var encrypted string
	if err := s.db.QueryRow("SELECT secrets_encrypted FROM storage_profiles WHERE id=$1", id).Scan(&encrypted); err != nil || strings.Contains(encrypted, "fixture-secret-key") {
		t.Fatal("plaintext credential stored", err)
	}
	w = operationRequest(s, "PUT", "/v1/admin/storage", `{"activeProfile":"`+id+`"}`, admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	key := s.newStorageKey("new.png")
	if key != "new.png" {
		t.Fatal("new key should be platform independent", key)
	}
	file, err := s.storage.Open("legacy.png")
	if err != nil {
		t.Fatal("switch broke old local image", err)
	}
	data, _ := io.ReadAll(file)
	_ = file.Close()
	if string(data) != "old-image" {
		t.Fatal("legacy content changed")
	}
	w = operationRequest(s, "PUT", "/v1/admin/storage", `{"activeProfile":"local"}`, admin, s.router().ServeHTTP)
	if w.Code != 200 || s.newStorageKey("local.png") != "local.png" {
		t.Fatal("cannot return to local")
	}
	signed, err := s.storage.(objectstore.SignedStore).SignedURL(key, 5*time.Minute)
	if err != nil || signed != "" {
		t.Fatal("local mode still depends on old cloud", err)
	}
	input["id"] = id
	input["bucket"] = "other-bucket"
	raw, _ = json.Marshal(input)
	w = operationRequest(s, "POST", "/v1/admin/storage", string(raw), admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal("cannot change unified storage location", w.Code, w.Body.String())
	}
}

func TestPublicCoversUseSameBackendCDNAndCanReturnToLocal(t *testing.T) {
	t.Setenv("CDN_BASE_URL", "https://obsolete.example.com")
	s, _, _ := operationTestServer(t)
	s.storage = objectstore.NewRouter(objectstore.NewLocal(t.TempDir()), s)
	admin := s.testAdminToken(domain.User{ID: "operator"})
	input := `{"enabled":true,"name":"统一存储","provider":"qiniu","endpoint":"https://storage.example.com","region":"cn-south-1","bucket":"images","prefix":"uploads","cdnDomain":"https://cdn.example.com","cdnMode":"qiniu_private","accessKey":"fixture-access","secretKey":"fixture-secret"}`
	w := operationRequest(s, "PUT", "/v1/admin/storage", input, admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if _, err := s.db.Exec("INSERT INTO inspiration_prompts(id,title,category,prompt,source,image_key,enabled) VALUES('cover','封面','摄影','提示词','作者','demo.jpg',true)"); err != nil {
		t.Fatal(err)
	}
	rows := readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, ""))
	if len(rows) != 1 || rows[0].ImageURL != "/v1/inspiration/images/demo.jpg" {
		t.Fatal("public image reference should remain stable", rows)
	}
	w = inspirationRequest(t, s, "GET", rows[0].ImageURL, nil, "")
	if w.Code != 302 || !strings.HasPrefix(w.Header().Get("Location"), "https://cdn.example.com/uploads/inspiration/demo.jpg?") || !strings.Contains(w.Header().Get("Location"), "token=") {
		t.Fatal("cover ignores shared configuration", w.Code, w.Header())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("expiring link must not be cached", w.Header().Get("Cache-Control"))
	}
	w = inspirationRequest(t, s, "GET", "/v1/inspiration/images/user/private.png", nil, "")
	if w.Code == 302 && !strings.Contains(w.Header().Get("Location"), "/inspiration/") {
		t.Fatal("public route signed user object")
	}
	w = operationRequest(s, "PUT", "/v1/admin/storage", `{"enabled":false}`, admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, ""))
	if rows[0].ImageURL != "/v1/inspiration/images/demo.jpg" {
		t.Fatal("obsolete environment still overrides backend", rows)
	}
	var config struct {
		Profiles []objectstore.Profile `json:"profiles"`
	}
	w = operationRequest(s, "GET", "/v1/admin/storage", "", admin, s.router().ServeHTTP)
	if err := json.Unmarshal(w.Body.Bytes(), &config); err != nil {
		t.Fatal(err)
	}
	p := config.Profiles[0]
	raw, _ := json.Marshal(map[string]any{"enabled": true, "id": p.ID, "name": p.Name, "provider": p.Provider, "region": p.Region, "bucket": p.Bucket, "endpoint": p.Endpoint, "prefix": p.Prefix, "cdnDomain": p.CDNDomain, "cdnMode": "public"})
	w = operationRequest(s, "PUT", "/v1/admin/storage", string(raw), admin, s.router().ServeHTTP)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	rows = readInspirationList(t, inspirationRequest(t, s, "GET", "/v1/inspiration/prompts", nil, ""))
	if rows[0].ImageURL != "https://cdn.example.com/uploads/inspiration/demo.jpg" {
		t.Fatal("public cover should use stable direct link", rows)
	}
	w = inspirationRequest(t, s, "GET", "/v1/inspiration/images/demo.jpg", nil, "")
	if w.Code != 302 || w.Header().Get("Cache-Control") != "public, max-age=600" {
		t.Fatal("public redirect should stay cacheable", w.Code, w.Header().Get("Cache-Control"))
	}
}
