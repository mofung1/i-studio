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

func TestStorageProfilesKeepOldImagesAndHideSecrets(t *testing.T) {
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
	if w.Code != 200 || strings.Contains(w.Body.String(), "fixture-access-key") || strings.Contains(w.Body.String(), "fixture-secret-key") {
		t.Fatal("storage credentials exposed", w.Code)
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
	if key != "@storage/"+id+"/new.png" {
		t.Fatal("cloud ownership not recorded", key)
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
	if err != nil || !strings.Contains(signed, "X-Amz-Signature") {
		t.Fatal("switch broke old cloud image", err)
	}
	input["id"] = id
	input["bucket"] = "other-bucket"
	raw, _ = json.Marshal(input)
	w = operationRequest(s, "POST", "/v1/admin/storage", string(raw), admin, s.router().ServeHTTP)
	if w.Code != 409 {
		t.Fatal("in-place location change accepted", w.Code)
	}
}
