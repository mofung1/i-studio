package studio

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/istudio/server/internal/idgen"
)

const maxSiteLogoSize = 2 << 20

type siteSettings struct {
	Name         string `json:"name"`
	LogoKey      string `json:"logoKey"`
	ContactMode  string `json:"contactMode"`
	ContactText  string `json:"contactText"`
	ContactQRKey string `json:"contactQrKey"`
}

type siteSettingsReader interface {
	QueryRow(query string, args ...any) *sql.Row
}

func (s *Service) siteSettingsPath() string {
	return filepath.Join(s.storageRoot, ".site", "config.json")
}

func (s *Service) readSiteSettings(reader siteSettingsReader) (siteSettings, error) {
	settings := siteSettings{Name: "iStudio", ContactMode: "none"}
	if reader != nil {
		err := reader.QueryRow("SELECT name,logo_key,contact_mode,contact_text,contact_qr_key FROM site_settings WHERE id=true").Scan(&settings.Name, &settings.LogoKey, &settings.ContactMode, &settings.ContactText, &settings.ContactQRKey)
		if errors.Is(err, sql.ErrNoRows) {
			return siteSettings{Name: "iStudio", ContactMode: "none"}, nil
		}
		return settings, err
	}
	raw, err := os.ReadFile(s.siteSettingsPath())
	if os.IsNotExist(err) {
		return settings, nil
	}
	if err != nil {
		return settings, err
	}
	err = json.Unmarshal(raw, &settings)
	return settings, err
}

func (s *Service) loadSiteSettings() (siteSettings, error) {
	if s.db != nil {
		return s.readSiteSettings(s.db)
	}
	return s.readSiteSettings(nil)
}

func publicSiteSettings(settings siteSettings) map[string]string {
	logoPath := ""
	if settings.LogoKey != "" {
		logoPath = "/v1/site-settings/logo/" + filepath.Base(settings.LogoKey)
	}
	contactQRPath := ""
	if settings.ContactMode == "qrcode" && settings.ContactQRKey != "" {
		contactQRPath = "/v1/site-settings/contact/" + filepath.Base(settings.ContactQRKey)
	}
	text := ""
	if settings.ContactMode == "text" {
		text = settings.ContactText
	}
	return map[string]string{"name": settings.Name, "logoPath": logoPath, "contactMode": settings.ContactMode, "contactText": text, "contactQrPath": contactQRPath}
}

// Serialize updates across API processes as well as the local file fallback.
func (s *Service) saveSiteSettings(name string, logo []byte, extension string, removeLogo bool, contact *siteContactUpdate) (siteSettings, error) {
	s.siteMu.Lock()
	defer s.siteMu.Unlock()
	var tx *sql.Tx
	var reader siteSettingsReader
	if s.db != nil {
		var err error
		tx, err = s.db.Begin()
		if err != nil {
			return siteSettings{}, err
		}
		defer tx.Rollback()
		if _, err = tx.Exec("SELECT pg_advisory_xact_lock(839581)"); err != nil {
			return siteSettings{}, err
		}
		reader = tx
	}
	settings, err := s.readSiteSettings(reader)
	if err != nil {
		return settings, err
	}
	previousLogo := settings.LogoKey
	previousQR := settings.ContactQRKey
	if contact != nil {
		switch contact.Mode {
		case "none":
			settings.ContactMode, settings.ContactText, settings.ContactQRKey = "none", "", ""
		case "text":
			settings.ContactMode, settings.ContactText, settings.ContactQRKey = "text", contact.Text, ""
		case "qrcode":
			if len(contact.Image) == 0 && settings.ContactQRKey == "" {
				return settings, errSiteContactInvalid
			}
			settings.ContactMode, settings.ContactText = "qrcode", ""
		default:
			return settings, errSiteContactInvalid
		}
	}
	settings.Name = name
	newLogo := ""
	if len(logo) > 0 {
		newLogo = ".site/logos/" + idgen.New() + extension
		if err := s.storage.Save(newLogo, bytes.NewReader(logo)); err != nil {
			_ = s.storage.Delete(newLogo)
			return settings, err
		}
		settings.LogoKey = newLogo
	} else if removeLogo {
		settings.LogoKey = ""
	}
	newQR := ""
	if contact != nil && len(contact.Image) > 0 {
		newQR = ".site/contact/" + idgen.New() + contact.Extension
		if err := s.storage.Save(newQR, bytes.NewReader(contact.Image)); err != nil {
			_ = s.storage.Delete(newQR)
			if newLogo != "" {
				_ = s.storage.Delete(newLogo)
			}
			return settings, err
		}
		settings.ContactQRKey = newQR
	}
	if tx != nil {
		_, err = tx.Exec("INSERT INTO site_settings(id,name,logo_key,contact_mode,contact_text,contact_qr_key) VALUES(true,$1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,logo_key=EXCLUDED.logo_key,contact_mode=EXCLUDED.contact_mode,contact_text=EXCLUDED.contact_text,contact_qr_key=EXCLUDED.contact_qr_key", settings.Name, settings.LogoKey, settings.ContactMode, settings.ContactText, settings.ContactQRKey)
		if err == nil {
			err = tx.Commit()
		}
	} else {
		err = s.writeSiteSettingsFile(settings)
	}
	if err != nil {
		if newLogo != "" {
			_ = s.storage.Delete(newLogo)
		}
		if newQR != "" {
			_ = s.storage.Delete(newQR)
		}
		return settings, err
	}
	if previousLogo != "" && previousLogo != settings.LogoKey {
		_ = s.storage.Delete(previousLogo)
	}
	if previousQR != "" && previousQR != settings.ContactQRKey {
		_ = s.storage.Delete(previousQR)
	}
	return settings, nil
}

func (s *Service) writeSiteSettingsFile(settings siteSettings) error {
	raw, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	path := s.siteSettingsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), "site-settings-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(raw); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func (s *Service) siteSettingsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.Method {
	case http.MethodGet:
		settings, err := s.loadSiteSettings()
		if err != nil {
			s.error(w, 500, "SITE_SETTINGS_STORAGE_ERROR", "网站配置读取失败")
			return
		}
		s.json(w, 200, publicSiteSettings(settings))
	case http.MethodPut:
		if !s.requireSettingsUser(w, r) {
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 2*maxSiteLogoSize+(64<<10))
		if err := r.ParseMultipartForm(maxSiteLogoSize); err != nil {
			s.error(w, 400, "SITE_SETTINGS_INVALID", "请提交网站配置，Logo 和二维码各不超过 2 MB")
			return
		}
		defer r.MultipartForm.RemoveAll()
		name := strings.TrimSpace(r.FormValue("name"))
		if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 50 || strings.ContainsFunc(name, unicode.IsControl) {
			s.error(w, 400, "SITE_NAME_INVALID", "网站名称需为 1–50 个字符，不能包含换行或控制字符")
			return
		}
		removeLogo := r.FormValue("removeLogo") == "true"
		files := r.MultipartForm.File["logo"]
		if len(files) > 1 || (len(files) > 0 && removeLogo) {
			s.error(w, 400, "SITE_LOGO_INVALID", "请选择一个 Logo，或恢复默认 Logo")
			return
		}
		logo, extension, err := readSiteImage(r, "logo")
		if err != nil {
			s.error(w, 400, "SITE_LOGO_INVALID", err.Error())
			return
		}
		var contact *siteContactUpdate
		if r.MultipartForm.Value["contactMode"] != nil {
			contact = &siteContactUpdate{Mode: r.FormValue("contactMode"), Text: strings.TrimSpace(r.FormValue("contactText"))}
			if !validSiteContact(contact.Mode, contact.Text) {
				s.error(w, 400, "SITE_CONTACT_INVALID", "请选择联系方式展示方式；文本需为 1–500 个字符")
				return
			}
			contact.Image, contact.Extension, err = readSiteImage(r, "contactQr")
			if err != nil || (len(contact.Image) > 0 && contact.Mode != "qrcode") {
				s.error(w, 400, "SITE_CONTACT_INVALID", "二维码需为不超过 2 MB 的 PNG 或 JPG 完整图片，且选择二维码展示方式")
				return
			}
		} else if len(r.MultipartForm.File["contactQr"]) > 0 {
			s.error(w, 400, "SITE_CONTACT_INVALID", "上传二维码前请选择二维码展示方式")
			return
		}
		settings, err := s.saveSiteSettings(name, logo, extension, removeLogo, contact)
		if errors.Is(err, errSiteContactInvalid) {
			s.error(w, 400, "SITE_CONTACT_INVALID", "请选择并上传一张联系方式二维码")
			return
		}
		if err != nil {
			s.error(w, 500, "SITE_SETTINGS_STORAGE_ERROR", "网站配置保存失败，请重试")
			return
		}
		s.json(w, 200, publicSiteSettings(settings))
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *Service) siteLogo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	settings, err := s.loadSiteSettings()
	if err != nil {
		s.error(w, 500, "SITE_SETTINGS_STORAGE_ERROR", "网站配置读取失败")
		return
	}
	key := settings.LogoKey
	prefix := "/v1/site-settings/logo/"
	if strings.HasPrefix(r.URL.Path, "/v1/site-settings/contact/") {
		prefix = "/v1/site-settings/contact/"
		key = ""
		if settings.ContactMode == "qrcode" {
			key = settings.ContactQRKey
		}
	}
	filename := strings.TrimPrefix(r.URL.Path, prefix)
	if key == "" || filename != filepath.Base(key) {
		http.NotFound(w, r)
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	if strings.HasSuffix(filename, ".jpg") {
		w.Header().Set("Content-Type", "image/jpeg")
	} else {
		w.Header().Set("Content-Type", "image/png")
	}
	if r.Method == http.MethodGet {
		_, _ = io.Copy(w, file)
	}
}

var errSiteContactInvalid = errors.New("invalid site contact")

type siteContactUpdate struct {
	Mode      string
	Text      string
	Image     []byte
	Extension string
}

func validSiteContact(mode, text string) bool {
	if mode == "none" || mode == "qrcode" {
		return true
	}
	return mode == "text" && utf8.ValidString(text) && utf8.RuneCountInString(text) >= 1 && utf8.RuneCountInString(text) <= 500 && !strings.ContainsFunc(text, func(r rune) bool {
		return unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t'
	})
}

func readSiteImage(r *http.Request, field string) ([]byte, string, error) {
	files := r.MultipartForm.File[field]
	if len(files) == 0 {
		return nil, "", nil
	}
	if len(files) != 1 {
		return nil, "", fmt.Errorf("每个位置只能上传一张图片")
	}
	file, err := files[0].Open()
	if err != nil {
		return nil, "", fmt.Errorf("图片读取失败，请重新选择")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxSiteLogoSize+1))
	if err != nil || len(data) == 0 || len(data) > maxSiteLogoSize {
		return nil, "", fmt.Errorf("图片不能为空，且不超过 2 MB")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 || (format != "png" && format != "jpeg") {
		return nil, "", fmt.Errorf("图片需为 PNG 或 JPG，尺寸不超过 4096 × 4096")
	}
	if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
		return nil, "", fmt.Errorf("图片已损坏，请重新选择")
	}
	if format == "jpeg" {
		return data, ".jpg", nil
	}
	return data, ".png", nil
}
