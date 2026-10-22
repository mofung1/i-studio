package studio

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

func (s *Service) assets(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if r.Method == http.MethodGet {
		if s.db == nil {
			s.json(w, 200, map[string]any{"assets": []any{}})
			return
		}
		rows, err := s.db.Query("SELECT id,project_id,filename,mime,size_bytes,width,height,hash,created_at FROM assets WHERE user_id=$1 AND hidden_at IS NULL ORDER BY created_at DESC", uid)
		if err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "资产查询失败")
			return
		}
		defer rows.Close()
		list := []map[string]any{}
		for rows.Next() {
			var id, filename, mime, hash string
			var project sql.NullString
			var size int64
			var width, height int
			var created time.Time
			if rows.Scan(&id, &project, &filename, &mime, &size, &width, &height, &hash, &created) == nil {
				list = append(list, map[string]any{"id": id, "projectId": project.String, "filename": filename, "mime": mime, "sizeBytes": size, "width": width, "height": height, "hash": hash, "contentPath": "/v1/assets/" + id + "/content", "createdAt": created})
			}
		}
		s.json(w, 200, map[string]any{"assets": list})
		return
	}
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if s.db == nil {
		s.error(w, http.StatusServiceUnavailable, "DATABASE_REQUIRED", "上传素材需要数据库服务")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 11<<20)
	if err := r.ParseMultipartForm(11 << 20); err != nil {
		s.error(w, 400, "ASSET_UPLOAD_INVALID", "上传文件无效")
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, header, err := r.FormFile("file")
	if err != nil {
		s.error(w, 400, "ASSET_FILE_REQUIRED", "请选择图片")
		return
	}
	defer file.Close()
	if header.Size > 10<<20 {
		s.error(w, 400, "ASSET_TOO_LARGE", "图片不能超过 10MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
	expectedMime, ok := allowed[ext]
	if !ok {
		s.error(w, 400, "ASSET_FORMAT_UNSUPPORTED", "仅支持 JPG、PNG、WebP")
		return
	}
	id := idgen.New()
	key := id + ext
	data, err := io.ReadAll(io.LimitReader(file, 10<<20+1))
	if err != nil || int64(len(data)) > 10<<20 {
		s.error(w, 400, "ASSET_TOO_LARGE", "图片不能超过 10MB")
		return
	}
	if detectedMime := http.DetectContentType(data); detectedMime != expectedMime {
		s.error(w, 400, "ASSET_CONTENT_INVALID", "文件内容与图片格式不匹配")
		return
	}
	hash := sha256.Sum256(data)
	config, _, decodeErr := image.DecodeConfig(bytes.NewReader(data))
	if decodeErr != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width) > maxThumbnailPixels/int64(config.Height) {
		s.error(w, 400, "ASSET_CONTENT_INVALID", "图片无法读取或像素超过 1 亿，请检查文件后重试")
		return
	}
	width, height := config.Width, config.Height
	projectID := r.FormValue("projectId")
	if projectID != "" && !s.userOwnsProject(uid, projectID) {
		s.error(w, 400, "PROJECT_NOT_FOUND", "所属项目不存在")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	defer tx.Rollback()
	// The account lock serializes deduplication, deletion and generation reservations.
	if _, err = tx.Exec("SELECT id FROM users WHERE id=$1 FOR UPDATE", uid); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	digest := hex.EncodeToString(hash[:])
	var existingID string
	err = tx.QueryRow("SELECT id FROM assets WHERE user_id=$1 AND hash=$2 AND task_id IS NULL ORDER BY created_at,id LIMIT 1 FOR UPDATE", uid, digest).Scan(&existingID)
	if err == nil {
		if _, err = tx.Exec("UPDATE assets SET hidden_at=NULL WHERE id=$1", existingID); err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "素材恢复失败")
			return
		}
		if err = tx.Commit(); err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "素材恢复失败")
			return
		}
		s.json(w, 200, map[string]any{"asset": map[string]any{"id": existingID}, "reused": true})
		return
	}
	if err != sql.ErrNoRows {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "素材查询失败")
		return
	}
	if err = s.ensureStorageCapacity(r.Context(), tx, uid, int64(len(data))); err != nil {
		s.operationFailure(w, err)
		return
	}
	key = s.newStorageKey(key)
	if err = s.storage.Save(key, bytes.NewReader(data)); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "图片保存失败")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = s.storage.Delete(key)
		}
	}()
	if _, err = tx.Exec("INSERT INTO assets (id,user_id,project_id,filename,storage_key,mime,size_bytes,width,height,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", id, uid, repository.NullableString(projectID), filepath.Base(header.Filename), key, expectedMime, int64(len(data)), width, height, digest); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	if projectID != "" {
		if _, err = tx.Exec("UPDATE projects SET updated_at=now() WHERE id=$1 AND user_id=$2", projectID, uid); err != nil {
			s.error(w, 500, "ASSET_STORAGE_ERROR", "项目更新失败")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "资产记录保存失败")
		return
	}
	committed = true

	s.json(w, 201, map[string]any{"asset": map[string]any{"id": id, "filename": filepath.Base(header.Filename), "mime": expectedMime, "sizeBytes": len(data), "width": width, "height": height, "hash": hex.EncodeToString(hash[:]), "projectId": projectID}})
}
