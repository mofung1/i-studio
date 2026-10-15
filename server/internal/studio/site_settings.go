package studio

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
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
	Name    string `json:"name"`
	LogoKey string `json:"logoKey"`
}

type siteSettingsReader interface {
	QueryRow(query string, args ...any) *sql.Row
}

func (s *Service) siteSettingsPath() string {
	return filepath.Join(s.storageRoot, ".site", "config.json")
}

func (s *Service) readSiteSettings(reader siteSettingsReader) (siteSettings, error) {
	settings := siteSettings{Name: "iStudio"}
	if reader != nil {
		err := reader.QueryRow("SELECT name,logo_key FROM site_settings WHERE id=true").Scan(&settings.Name, &settings.LogoKey)
		if errors.Is(err, sql.ErrNoRows) {
			return siteSettings{Name: "iStudio"}, nil
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
	return map[string]string{"name": settings.Name, "logoPath": logoPath}
}

// Serialize updates across API processes as well as the local file fallback.
func (s *Service) saveSiteSettings(name string, logo []byte, extension string, removeLogo bool) (siteSettings, error) {
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
	if tx != nil {
		_, err = tx.Exec("INSERT INTO site_settings(id,name,logo_key) VALUES(true,$1,$2) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,logo_key=EXCLUDED.logo_key", settings.Name, settings.LogoKey)
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
		return settings, err
	}
	if previousLogo != "" && previousLogo != settings.LogoKey {
		_ = s.storage.Delete(previousLogo)
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
		r.Body = http.MaxBytesReader(w, r.Body, maxSiteLogoSize+(64<<10))
		if err := r.ParseMultipartForm(maxSiteLogoSize); err != nil {
			s.error(w, 400, "SITE_SETTINGS_INVALID", "请提交网站名称及不超过 2 MB 的 Logo")
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
		var logo []byte
		extension := ""
		if len(files) == 1 {
			file, err := files[0].Open()
			if err != nil {
				s.error(w, 400, "SITE_LOGO_INVALID", "Logo 读取失败，请重新选择")
				return
			}
			logo, err = io.ReadAll(io.LimitReader(file, maxSiteLogoSize+1))
			file.Close()
			if err != nil || len(logo) == 0 || len(logo) > maxSiteLogoSize {
				s.error(w, 400, "SITE_LOGO_INVALID", "Logo 文件需为非空图片，且不超过 2 MB")
				return
			}
			config, format, err := image.DecodeConfig(bytes.NewReader(logo))
			if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 || (format != "png" && format != "jpeg") {
				s.error(w, 400, "SITE_LOGO_INVALID", "Logo 需为 PNG 或 JPG 图片，尺寸不超过 4096 × 4096")
				return
			}
			if _, _, err := image.Decode(bytes.NewReader(logo)); err != nil {
				s.error(w, 400, "SITE_LOGO_INVALID", "Logo 图片已损坏，请重新选择")
				return
			}
			if format == "jpeg" {
				extension = ".jpg"
			} else {
				extension = ".png"
			}
		}
		settings, err := s.saveSiteSettings(name, logo, extension, removeLogo)
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
	filename := strings.TrimPrefix(r.URL.Path, "/v1/site-settings/logo/")
	if settings.LogoKey == "" || filename != filepath.Base(settings.LogoKey) {
		http.NotFound(w, r)
		return
	}
	file, err := s.storage.Open(settings.LogoKey)
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
