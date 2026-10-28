package studio

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
	objectstore "github.com/istudio/server/internal/storage"
)

type storageInput struct {
	objectstore.Profile
	objectstore.Secrets
	ActiveProfile *string `json:"activeProfile"`
	Enabled       *bool   `json:"enabled"`
	Check         bool    `json:"check"`
	Sync          bool    `json:"sync"`
	SyncAfter     string  `json:"syncAfter"`
}

func (s *Service) storageDraft(input storageInput) (objectstore.Profile, objectstore.Secrets, error) {
	p, secrets := input.Profile, input.Secrets
	p.Endpoint = strings.TrimRight(strings.TrimSpace(p.Endpoint), "/")
	p.PublicEndpoint = strings.TrimRight(strings.TrimSpace(p.PublicEndpoint), "/")
	p.CDNDomain = strings.TrimRight(strings.TrimSpace(p.CDNDomain), "/")
	p.Prefix = strings.TrimSpace(p.Prefix)
	if p.ID != "" {
		prior, saved, err := s.LoadProfile(p.ID)
		if err != nil {
			return p, secrets, fmt.Errorf("存储配置不存在")
		}
		if prior.Provider != p.Provider || prior.Endpoint != p.Endpoint {
			if secrets.AccessKey == "" || secrets.SecretKey == "" {
				return p, secrets, fmt.Errorf("更换存储平台或 Endpoint 时，请重新填写访问密钥")
			}
		} else {
			if secrets.AccessKey == "" {
				secrets.AccessKey = saved.AccessKey
			}
			if secrets.SecretKey == "" {
				secrets.SecretKey = saved.SecretKey
			}
		}
		if secrets.CDNKey == "" {
			secrets.CDNKey = saved.CDNKey
		}
	} else {
		p.ID = "store_" + idgen.New()
	}
	if _, err := objectstore.NewCloud(p, secrets); err != nil {
		return p, secrets, err
	}
	if p.CDNDomain != "" && p.CDNMode != "public" && p.CDNMode != "qiniu_private" && secrets.CDNKey == "" {
		return p, secrets, fmt.Errorf("请配置 CDN 鉴权密钥")
	}
	return p, secrets, nil
}

func (s *Service) adminStorage(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodGet {
		rows, err := s.db.Query("SELECT id FROM storage_profiles ORDER BY created_at,id")
		if err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储配置读取失败")
			return
		}
		ids := []string{}
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				break
			}
			ids = append(ids, id)
		}
		readErr := rows.Err()
		rows.Close()
		if err != nil || readErr != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储配置读取失败")
			return
		}
		profiles := []any{}
		for _, id := range ids {
			p, secrets, err := s.LoadProfile(id)
			if err != nil {
				s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储密钥无法读取，请检查加密密钥是否恢复")
				return
			}
			profiles = append(profiles, struct {
				objectstore.Profile
				objectstore.Secrets
			}{p, secrets})
		}
		var active string
		if s.db.QueryRow("SELECT active_profile FROM storage_settings WHERE id=true").Scan(&active) != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "存储配置读取失败")
			return
		}
		s.json(w, 200, map[string]any{"activeProfile": active, "profiles": profiles})
		return
	}
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input storageInput
	if !decode(r, &input) {
		s.error(w, 400, "STORAGE_CONFIG_INVALID", "配置格式错误")
		return
	}
	if input.Check {
		p, secrets, err := s.storageDraft(input)
		if err != nil {
			s.error(w, 400, "STORAGE_CONFIG_INVALID", err.Error())
			return
		}
		if err := checkCloudStorage(p, secrets); err != nil {
			s.error(w, 400, "STORAGE_CHECK_FAILED", err.Error())
			return
		}
		message := "OSS 读写、私有访问和下载链接检查通过"
		if p.CDNMode == "public" {
			message = "公开 OSS / CDN 读写和图片直链检查通过"
		}
		s.json(w, 200, map[string]any{"checked": true, "message": message})
		return
	}
	if input.Sync {
		s.syncStorageImages(w, r, input)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	var current string
	if tx.QueryRow("SELECT active_profile FROM storage_settings WHERE id=true FOR UPDATE").Scan(&current) != nil {
		s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
		return
	}
	if input.ActiveProfile != nil || input.Enabled != nil && !*input.Enabled {
		id := "local"
		if input.ActiveProfile != nil {
			id = *input.ActiveProfile
		}
		if id != "local" {
			if _, _, err = s.LoadProfile(id); err != nil {
				s.error(w, 400, "STORAGE_PROFILE_NOT_FOUND", "存储配置不存在")
				return
			}
		}
		if _, err = tx.Exec("UPDATE storage_settings SET active_profile=$1 WHERE id=true", id); err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "切换失败")
			return
		}
	} else {
		p, secrets, draftErr := s.storageDraft(input)
		if draftErr != nil {
			s.error(w, 400, "STORAGE_CONFIG_INVALID", draftErr.Error())
			return
		}
		plain, _ := json.Marshal(secrets)
		encrypted, err := newAIConfigStore(s).encrypt("storage:"+p.ID, string(plain))
		if err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "密钥加密失败")
			return
		}
		raw, _ := json.Marshal(p)
		if _, err = tx.Exec("INSERT INTO storage_profiles(id,config,secrets_encrypted) VALUES($1,$2::jsonb,$3) ON CONFLICT(id) DO UPDATE SET config=EXCLUDED.config,secrets_encrypted=EXCLUDED.secrets_encrypted", p.ID, raw, encrypted); err != nil {
			s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
			return
		}
		if input.Enabled != nil && *input.Enabled {
			if _, err = tx.Exec("UPDATE storage_settings SET active_profile=$1 WHERE id=true", p.ID); err != nil {
				s.error(w, 500, "STORAGE_CONFIG_ERROR", "启用失败")
				return
			}
		}
	}
	if err = tx.Commit(); err != nil {
		s.error(w, 500, "STORAGE_CONFIG_ERROR", "保存失败")
		return
	}
	u, _ := s.currentAdministrator(r)
	s.audit(u.ID, "storage.update", "storage", "存储配置已更新")
	s.json(w, 200, map[string]any{"saved": true})
}

func (s *Service) syncStorageImages(w http.ResponseWriter, r *http.Request, input storageInput) {
	p, secrets, err := s.storageDraft(input)
	if err != nil {
		s.error(w, 400, "STORAGE_CONFIG_INVALID", err.Error())
		return
	}
	if input.SyncAfter == "" {
		if err = checkCloudStorage(p, secrets); err != nil {
			s.error(w, 400, "STORAGE_CHECK_FAILED", err.Error())
			return
		}
	}
	keys := []string{}
	err = filepath.WalkDir(s.storageRoot, func(filename string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if entry.IsDir() {
			if entry.Name() == ".ai" {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.ToLower(filepath.Ext(filename))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" && ext != ".gif" && ext != ".avif" {
			return nil
		}
		rel, err := filepath.Rel(s.storageRoot, filename)
		if err != nil {
			return err
		}
		keys = append(keys, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		s.error(w, 500, "STORAGE_SYNC_FAILED", "本地图片目录无法读取")
		return
	}
	sort.Strings(keys)
	start := sort.Search(len(keys), func(i int) bool { return keys[i] > input.SyncAfter })
	end := min(start+8, len(keys))
	cloud, err := objectstore.NewCloud(p, secrets)
	if err != nil {
		s.error(w, 400, "STORAGE_CONFIG_INVALID", err.Error())
		return
	}
	for _, key := range keys[start:end] {
		if r.Context().Err() != nil {
			return
		}
		file, openErr := os.Open(filepath.Join(s.storageRoot, filepath.FromSlash(key)))
		if openErr != nil {
			s.error(w, 500, "STORAGE_SYNC_FAILED", "本地图片读取失败，可重试同步")
			return
		}
		err = cloud.Save(key, file)
		file.Close()
		if err != nil {
			s.error(w, 502, "STORAGE_SYNC_FAILED", "图片上传失败，请检查云存储连接后重试")
			return
		}
	}
	next := input.SyncAfter
	if end > start {
		next = keys[end-1]
	}
	s.json(w, 200, map[string]any{"total": len(keys), "completed": end, "next": next, "done": end == len(keys)})
}

// Probe only an application-created temporary object; never inspect user files.
func checkCloudStorage(p objectstore.Profile, secrets objectstore.Secrets) error {
	client := &http.Client{Timeout: 20 * time.Second}
	cloud, err := objectstore.NewCloudWithClient(p, secrets, client)
	if err != nil {
		return err
	}
	key := ".storage-check/" + idgen.New() + ".txt"
	data := []byte("istudio-storage-check")
	if err = cloud.Save(key, bytes.NewReader(data)); err != nil {
		return fmt.Errorf("OSS 上传检查失败，请检查空间、区域、Endpoint 和密钥")
	}
	defer cloud.Delete(key)
	file, err := cloud.Open(key)
	if err != nil {
		return fmt.Errorf("OSS 读取检查失败")
	}
	read, err := io.ReadAll(io.LimitReader(file, 1024))
	file.Close()
	if err != nil || !bytes.Equal(read, data) {
		return fmt.Errorf("OSS 读取内容校验失败")
	}
	target, err := cloud.SignedURL(key, 5*time.Minute)
	if err != nil {
		return fmt.Errorf("下载链接生成失败")
	}
	response, err := client.Get(target)
	if err != nil {
		return fmt.Errorf("下载地址无法访问，请检查 CDN、证书或下载 Endpoint")
	}
	read, err = io.ReadAll(io.LimitReader(response.Body, 1024))
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || !bytes.Equal(read, data) {
		return fmt.Errorf("下载链接检查失败，请检查 CDN 回源和鉴权配置")
	}
	if p.CDNMode == "public" {
		return nil
	}
	unsigned, _ := url.Parse(target)
	unsigned.RawQuery = ""
	response, err = client.Get(unsigned.String())
	if err != nil {
		return fmt.Errorf("无法验证私有访问权限")
	}
	response.Body.Close()
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return fmt.Errorf("未签名链接仍可访问，请将空间设为私有并开启 CDN 私有回源鉴权")
	}
	if p.CDNDomain != "" {
		expired, signErr := cloud.SignedURL(key, -time.Minute)
		if signErr != nil {
			return fmt.Errorf("过期链接生成失败")
		}
		response, err = client.Get(expired)
		if err != nil {
			return fmt.Errorf("无法验证 CDN 链接过期行为")
		}
		response.Body.Close()
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			return fmt.Errorf("CDN 过期签名仍可访问，请检查缓存鉴权")
		}
	}
	return nil
}
