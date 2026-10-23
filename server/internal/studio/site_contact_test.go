package studio

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

func putSiteContact(t *testing.T, s *Service, mode, text string, images ...[]byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{"name": "联系测试", "contactMode": mode, "contactText": text} {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, data := range images {
		part, err := writer.CreateFormFile("contactQr", "untrusted.svg")
		if err != nil {
			t.Fatal(err)
		}
		if _, err = part.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPut, "/v1/admin/site-settings", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+s.testAdminToken(domain.User{ID: "owner"}))
	w := httptest.NewRecorder()
	if s.db == nil {
		s.siteSettingsHandler(w, r)
	} else {
		s.router().ServeHTTP(w, r)
	}
	return w
}

func TestSiteContactModesPersistenceAndPublicImage(t *testing.T) {
	for _, database := range []bool{false, true} {
		t.Run(map[bool]string{false: "file", true: "database"}[database], func(t *testing.T) {
			s := testSiteServer(t)
			if database {
				s.db = isolatedTestDatabase(t)
			}
			text := "微信：studio_123\n邮箱：support@example.com\n<script>仅文本</script>"
			if w := putSiteContact(t, s, "text", "  "+text+"  "); w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			restored := &Service{db: s.db, storageRoot: s.storageRoot, storage: s.storage}
			settings, err := restored.loadSiteSettings()
			if err != nil || settings.ContactMode != "text" || settings.ContactText != text {
				t.Fatal("contact lost after reload", settings, err)
			}
			data := siteLogoBytes(t, "png")
			w := putSiteContact(t, s, "qrcode", "", data)
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			var public map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &public); err != nil {
				t.Fatal(err)
			}
			if public["contactText"] != "" || public["contactQrKey"] != "" || !strings.HasSuffix(public["contactQrPath"], ".png") {
				t.Fatal("private key or inactive text exposed", public)
			}
			oldPath := public["contactQrPath"]
			for _, method := range []string{"GET", "HEAD"} {
				w = operationRequest(s, method, oldPath, "", "", s.router().ServeHTTP)
				if w.Code != 200 || w.Header().Get("Content-Type") != "image/png" || (method == "GET" && !bytes.Equal(w.Body.Bytes(), data)) || (method == "HEAD" && w.Body.Len() != 0) {
					t.Fatal("anonymous image route failed", method, w.Code)
				}
			}
			// An older branding client can still change the site name without clearing contact settings.
			if w = putSiteSettings(t, s, "owner", "只改网站名称", nil, false); w.Code != 200 || !strings.Contains(w.Body.String(), oldPath) {
				t.Fatal("legacy branding save cleared contact", w.Body.String())
			}
			if w = putSiteContact(t, s, "qrcode", "", siteLogoBytes(t, "jpeg")); w.Code != 200 {
				t.Fatal(w.Body.String())
			}
			if w = operationRequest(s, "GET", oldPath, "", "", s.router().ServeHTTP); w.Code != 404 {
				t.Fatal("replaced image is still served", w.Code)
			}
			for _, mode := range []string{"text", "none"} {
				if w = putSiteContact(t, s, mode, "联系文本"); w.Code != 200 {
					t.Fatal(w.Body.String())
				}
				settings, err = restored.loadSiteSettings()
				if err != nil || settings.ContactQRKey != "" || (mode == "none" && settings.ContactText != "") {
					t.Fatal("inactive contact not cleared", settings, err)
				}
			}
			files, err := filepath.Glob(filepath.Join(s.storageRoot, ".site/contact/*"))
			if err != nil || len(files) != 0 {
				t.Fatal("replaced contact files leaked", files, err)
			}
		})
	}
}

func TestSiteContactInvalidInputPreservesSavedSettings(t *testing.T) {
	s := testSiteServer(t)
	if w := putSiteContact(t, s, "text", strings.Repeat("字", 500)); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	for _, test := range []struct {
		mode, text string
		images     [][]byte
	}{
		{mode: "unknown"}, {mode: "text"}, {mode: "text", text: "  "},
		{mode: "text", text: strings.Repeat("字", 501)}, {mode: "text", text: "bad\x00text"},
		{mode: "qrcode"}, {mode: "qrcode", images: [][]byte{[]byte("<svg onload='alert(1)'/>")}},
		{mode: "qrcode", images: [][]byte{siteLogoBytes(t, "png")[:40]}},
		{mode: "qrcode", images: [][]byte{bytes.Repeat([]byte("x"), maxSiteLogoSize+1)}},
		{mode: "qrcode", images: [][]byte{siteLogoBytes(t, "png"), siteLogoBytes(t, "png")}},
		{mode: "text", text: "text", images: [][]byte{siteLogoBytes(t, "png")}},
	} {
		if w := putSiteContact(t, s, test.mode, test.text, test.images...); w.Code != 400 {
			t.Fatal("invalid contact accepted", test.mode, w.Code, w.Body.String())
		}
		settings, err := s.loadSiteSettings()
		if err != nil || settings.ContactMode != "text" || settings.ContactText != strings.Repeat("字", 500) {
			t.Fatal("invalid input changed contact", settings, err)
		}
	}
	for token, want := range map[string]int{"": 401, s.testToken(domain.User{ID: "member"}): 403} {
		w := operationRequest(s, "PUT", "/v1/site-settings", "", token, s.siteSettingsHandler)
		if w.Code != want {
			t.Fatal("unauthorized write", w.Code, want)
		}
	}
}

type failingContactStore struct{ objectstore.Store }

func (s failingContactStore) Save(key string, reader io.Reader) error {
	if strings.HasPrefix(key, ".site/contact/") {
		return errors.New("test storage failure")
	}
	return s.Store.Save(key, reader)
}

func TestSiteContactStorageFailureRollsBackBranding(t *testing.T) {
	s := testSiteServer(t)
	if w := putSiteContact(t, s, "text", "原联系方式"); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	s.storage = failingContactStore{s.storage}
	_, err := s.saveSiteSettings("失败更新", siteLogoBytes(t, "png"), ".png", false, &siteContactUpdate{Mode: "qrcode", Image: siteLogoBytes(t, "png"), Extension: ".png"})
	if err == nil {
		t.Fatal("storage failure accepted")
	}
	settings, err := s.loadSiteSettings()
	if err != nil || settings.Name != "联系测试" || settings.ContactText != "原联系方式" || settings.LogoKey != "" {
		t.Fatal("failed save partially persisted", settings, err)
	}
	for _, directory := range []string{"logos", "contact"} {
		files, err := os.ReadDir(filepath.Join(s.storageRoot, ".site", directory))
		if err != nil && !os.IsNotExist(err) || len(files) != 0 {
			t.Fatal("failed save leaked new images", directory, files, err)
		}
	}
}
