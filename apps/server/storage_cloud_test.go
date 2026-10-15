package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

type storageTransport func(*http.Request) (*http.Response, error)

func (f storageTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func cloudFixture(provider string) storageProfile {
	return storageProfile{ID: "store_fixture", Name: "测试存储", Provider: provider, Endpoint: "https://storage.example.com", PublicEndpoint: "https://download.example.com", Region: "cn-east-1", Bucket: "private-images", Prefix: "studio", PathStyle: provider != "aliyun"}
}

func TestCloudAdaptersRoundTripAndPrivatePresigning(t *testing.T) {
	for _, provider := range []string{"aliyun", "qiniu", "tencent", "s3"} {
		t.Run(provider, func(t *testing.T) {
			var saved []byte
			var methods []string
			transport := storageTransport(func(r *http.Request) (*http.Response, error) {
				methods = append(methods, r.Method)
				if r.Header.Get("Authorization") == "" {
					t.Fatal("unsigned cloud request")
				}
				if !strings.HasSuffix(r.URL.Path, "/studio/images/fixture.png") {
					t.Fatal("wrong object location", r.URL.Path)
				}
				response := &http.Response{StatusCode: 200, Header: http.Header{"Etag": []string{`"fixture"`}}, Body: io.NopCloser(strings.NewReader("")), Request: r}
				switch r.Method {
				case "PUT":
					saved, _ = io.ReadAll(r.Body)
					if r.Header.Get("Content-Type") != "image/png" {
						t.Fatal("missing image content type")
					}
				case "GET":
					response.Body = io.NopCloser(bytes.NewReader(saved))
					response.ContentLength = int64(len(saved))
				case "DELETE":
					saved = nil
				}
				return response, nil
			})
			p := cloudFixture(provider)
			c, err := newCloudStorageWithClient(p, storageSecrets{AccessKey: "fixture-access", SecretKey: "fixture-secret"}, &http.Client{Transport: transport})
			if err != nil {
				t.Fatal(err)
			}
			if err = c.Save("images/fixture.png", strings.NewReader("fixture-image-bytes")); err != nil {
				t.Fatal(err)
			}
			file, err := c.Open("images/fixture.png")
			if err != nil {
				t.Fatal(err)
			}
			data, _ := io.ReadAll(file)
			_ = file.Close()
			if string(data) != "fixture-image-bytes" {
				t.Fatal("cloud round trip corrupted data", string(data))
			}
			signed, err := c.SignedURL("images/fixture.png", 5*time.Minute)
			if err != nil {
				t.Fatal(err)
			}
			u, _ := url.Parse(signed)
			if !strings.Contains(u.Host, "download.example.com") || u.RawQuery == "" || strings.Contains(signed, "fixture-secret") {
				t.Fatal("invalid presigned download", u.Host)
			}
			if len(methods) != 2 {
				t.Fatal("signing performed a network request")
			}
			if err = c.Delete("images/fixture.png"); err != nil {
				t.Fatal(err)
			}
			if saved != nil {
				t.Fatal("cloud deletion did not execute")
			}
		})
	}
}
func TestCDNSigningUsesProviderProtocol(t *testing.T) {
	// Published Alibaba Type A example, independent of implementation.
	now := time.Unix(1444435200, 0)
	c := &cloudStorage{profile: storageProfile{CDNDomain: "https://cdn.example.com", CDNMode: "aliyun_type_a"}, secrets: storageSecrets{CDNKey: "aliyuncdnexp1234"}}
	signed, err := c.cdnURL("video/standard/test.mp4", 5*time.Minute, now)
	u, _ := url.Parse(signed)
	if err != nil || u.Query().Get("auth_key") != "1444435200-0-0-23bf85053008f5c0e791667a313e28ce" {
		t.Fatal("Type A signature mismatch", u.Query().Get("auth_key"), err)
	}

	c.profile.CDNMode = "tencent_type_a"
	signed, err = c.cdnURL("video/standard/test.mp4", 5*time.Minute, now)
	u, _ = url.Parse(signed)
	if err != nil || u.Query().Get("sign") == "" || u.Query().Get("auth_key") != "" {
		t.Fatal("Tencent parameter mismatch", err)
	}
	c.profile.CDNMode = "qiniu_private"
	c.secrets = storageSecrets{AccessKey: "fixture-access", SecretKey: "fixture-secret"}
	signed, err = c.cdnURL("images/a.png", 5*time.Minute, now)
	u, _ = url.Parse(signed)
	if err != nil || u.Query().Get("e") != "1444435500" || !strings.HasPrefix(u.Query().Get("token"), "fixture-access:") || !strings.Contains(signed, "&token=") {
		t.Fatal("invalid Qiniu token", err)
	}
}
func TestStorageProfilesKeepOldImagesAndHideSecrets(t *testing.T) {
	s, _, _ := operationTestServer(t)
	s.storage = newLocalStorage(t.TempDir())
	s.storage = &profileStorage{server: s, local: s.storage}
	if err := s.storage.Save("legacy.png", strings.NewReader("old-image")); err != nil {
		t.Fatal(err)
	}
	admin := s.testAdminToken(user{ID: "operator"})
	member := s.testToken(user{ID: "member"})
	input := map[string]any{"name": "七牛生产", "provider": "qiniu", "endpoint": "https://s3.cn-east-1.qiniucs.com", "region": "cn-east-1", "bucket": "fixture-bucket", "prefix": "studio", "accessKey": "fixture-access-key", "secretKey": "fixture-secret-key"}
	raw, _ := json.Marshal(input)
	w := operationRequest(s, "POST", "/v1/admin/storage", string(raw), member, s.adminHandler)
	if w.Code != 403 {
		t.Fatal("ordinary account configured storage", w.Code)
	}
	w = operationRequest(s, "POST", "/v1/admin/storage", string(raw), admin, s.adminHandler)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = operationRequest(s, "GET", "/v1/admin/storage", "", admin, s.adminHandler)
	if w.Code != 200 || strings.Contains(w.Body.String(), "fixture-access-key") || strings.Contains(w.Body.String(), "fixture-secret-key") {
		t.Fatal("storage credentials exposed", w.Code)
	}
	var config struct {
		Profiles []storageProfile `json:"profiles"`
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
	w = operationRequest(s, "PUT", "/v1/admin/storage", `{"activeProfile":"`+id+`"}`, admin, s.adminHandler)
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
	w = operationRequest(s, "PUT", "/v1/admin/storage", `{"activeProfile":"local"}`, admin, s.adminHandler)
	if w.Code != 200 || s.newStorageKey("local.png") != "local.png" {
		t.Fatal("cannot return to local")
	}
	signed, err := s.storage.(signedObjectStorage).SignedURL(key, 5*time.Minute)
	if err != nil || !strings.Contains(signed, "X-Amz-Signature") {
		t.Fatal("switch broke old cloud image", err)
	}
	input["id"] = id
	input["bucket"] = "other-bucket"
	raw, _ = json.Marshal(input)
	w = operationRequest(s, "POST", "/v1/admin/storage", string(raw), admin, s.adminHandler)
	if w.Code != 409 {
		t.Fatal("in-place location change accepted", w.Code)
	}
}
