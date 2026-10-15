package main

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func testSiteServer(t *testing.T) *server {
	t.Helper()
	root := t.TempDir()
	return &server{secret: []byte("test-secret"), storageRoot: root, storage: newLocalStorage(root)}
}

func siteLogoBytes(t *testing.T, format string) []byte {
	t.Helper()
	var body bytes.Buffer
	logo := image.NewRGBA(image.Rect(0, 0, 16, 16))
	logo.Set(8, 8, color.RGBA{R: 255, A: 255})
	var err error
	if format == "jpeg" {
		err = jpeg.Encode(&body, logo, nil)
	} else {
		err = png.Encode(&body, logo)
	}
	if err != nil {
		t.Fatal(err)
	}
	return body.Bytes()
}

func putSiteSettings(t *testing.T, s *server, uid, name string, logo []byte, removeLogo bool) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("name", name); err != nil {
		t.Fatal(err)
	}
	if removeLogo {
		_ = writer.WriteField("removeLogo", "true")
	}
	if logo != nil {
		part, err := writer.CreateFormFile("logo", "untrusted-name.svg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(logo); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPut, "/v1/site-settings", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	if uid != "" {
		r.Header.Set("Authorization", "Bearer "+s.testAdminToken(user{ID: uid}))
	}
	w := httptest.NewRecorder()
	s.siteSettingsHandler(w, r)
	return w
}

func TestSiteBrandingPersistencePublicLogoAndRestore(t *testing.T) {
	s := testSiteServer(t)
	settings, err := s.loadSiteSettings()
	if err != nil || settings.Name != "iStudio" || settings.LogoKey != "" {
		t.Fatalf("default branding: %+v, %v", settings, err)
	}
	logo := siteLogoBytes(t, "png")
	w := putSiteSettings(t, s, "owner", "  新工作室  ", logo, false)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var public map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &public); err != nil {
		t.Fatal(err)
	}
	if public["name"] != "新工作室" || !strings.HasSuffix(public["logoPath"], ".png") || public["logoKey"] != "" {
		t.Fatalf("public branding: %v", public)
	}
	restored := &server{storageRoot: s.storageRoot, storage: newLocalStorage(s.storageRoot)}
	settings, err = restored.loadSiteSettings()
	if err != nil || settings.Name != "新工作室" {
		t.Fatalf("branding lost after restart: %+v, %v", settings, err)
	}
	w = httptest.NewRecorder()
	restored.siteSettingsHandler(w, httptest.NewRequest(http.MethodGet, "/v1/site-settings", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "新工作室") {
		t.Fatal("anonymous visitors cannot read branding", w.Body.String())
	}
	w = httptest.NewRecorder()
	restored.siteLogo(w, httptest.NewRequest(http.MethodGet, public["logoPath"], nil))
	if w.Code != 200 || w.Header().Get("Content-Type") != "image/png" || !bytes.Equal(w.Body.Bytes(), logo) {
		t.Fatal("anonymous visitors cannot load logo", w.Code)
	}
	w = putSiteSettings(t, s, "owner", "仅改名称", nil, false)
	if w.Code != 200 || !strings.Contains(w.Body.String(), public["logoPath"]) {
		t.Fatal("changing name removed logo", w.Body.String())
	}
	w = putSiteSettings(t, s, "owner", "替换 Logo", siteLogoBytes(t, "jpeg"), false)
	if w.Code != 200 || !strings.Contains(w.Body.String(), ".jpg") {
		t.Fatal("JPEG upload failed", w.Body.String())
	}
	if _, err := os.Stat(filepath.Join(s.storageRoot, settings.LogoKey)); !os.IsNotExist(err) {
		t.Fatal("replaced logo was not cleaned up")
	}
	w = putSiteSettings(t, s, "owner", "iStudio", nil, true)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	settings, err = s.loadSiteSettings()
	if err != nil || settings.Name != "iStudio" || settings.LogoKey != "" {
		t.Fatalf("restore failed: %+v %v", settings, err)
	}
	files, err := filepath.Glob(filepath.Join(s.storageRoot, ".site/logos/*"))
	if err != nil || len(files) != 0 {
		t.Fatal("restored logo files leaked", files, err)
	}
}

func TestSiteBrandingValidationAndAuthorization(t *testing.T) {
	s := testSiteServer(t)
	for _, test := range []struct {
		uid    string
		status int
	}{{"", 401}} {
		w := putSiteSettings(t, s, test.uid, "Unauthorized", nil, false)
		if w.Code != test.status {
			t.Fatalf("authorization %s: %d", test.uid, w.Code)
		}
	}
	for _, test := range []struct {
		name   string
		logo   []byte
		remove bool
	}{
		{name: ""}, {name: strings.Repeat("名", 51)}, {name: "name\nline"},
		{name: "Bad logo", logo: []byte("<svg onload='alert(1)'/>")},
		{name: "Empty logo", logo: []byte{}},
		{name: "Oversized logo", logo: bytes.Repeat([]byte("x"), maxSiteLogoSize+1)},
		{name: "Truncated logo", logo: siteLogoBytes(t, "png")[:40]},
		{name: "Ambiguous logo", logo: siteLogoBytes(t, "png"), remove: true},
	} {
		w := putSiteSettings(t, s, "owner", test.name, test.logo, test.remove)
		if w.Code != 400 {
			t.Fatalf("invalid input %q accepted: %d, %s", test.name, w.Code, w.Body.String())
		}
	}
	settings, err := s.loadSiteSettings()
	if err != nil || settings.Name != "iStudio" || settings.LogoKey != "" {
		t.Fatal("invalid submissions changed branding", settings, err)
	}
	w := httptest.NewRecorder()
	s.siteLogo(w, httptest.NewRequest(http.MethodGet, "/v1/site-settings/logo/../../.ai/config.json", nil))
	if w.Code != 404 {
		t.Fatal("logo path traversal was accepted")
	}
}

func TestSiteBrandingConcurrentUpdates(t *testing.T) {
	s := testSiteServer(t)
	logo := siteLogoBytes(t, "png")
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.saveSiteSettings("并发更新", logo, ".png", false); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	settings, err := s.loadSiteSettings()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(s.storageRoot, settings.LogoKey)); err != nil {
		t.Fatal("active logo missing", err)
	}
	files, err := filepath.Glob(filepath.Join(s.storageRoot, ".site/logos/*"))
	if err != nil || len(files) != 1 {
		t.Fatal("concurrent uploads leaked files", files, err)
	}
}

func TestSiteBrandingDatabasePersistence(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec("INSERT INTO users(id,username,password_hash) VALUES('owner','owner','unused')"); err != nil {
		t.Fatal(err)
	}
	w := putSiteSettings(t, s, "owner", "数据库品牌", siteLogoBytes(t, "png"), false)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	restored := &server{db: s.db, storageRoot: s.storageRoot, storage: s.storage}
	settings, err := restored.loadSiteSettings()
	if err != nil || settings.Name != "数据库品牌" || settings.LogoKey == "" {
		t.Fatal("database branding lost", settings, err)
	}
	w = putSiteSettings(t, s, "other", "Unauthorized", nil, true)
	if w.Code != 200 {
		t.Fatal("second account cannot manage branding", w.Code, w.Body.String())
	}
}
