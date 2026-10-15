package studio

import (
	"database/sql"
	"io"
	mimepkg "mime"
	"net/http"
	"strings"

	"github.com/istudio/server/internal/repository"
)

func (s *Service) assetContent(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/metadata") {
		s.assetMetadata(w, r)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/thumbnail") {
		s.assetThumbnail(w, r)
		return
	}
	if r.Method == http.MethodDelete {
		s.deleteAsset(w, r, assetIDFromPath(r.URL.Path))
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/assets/"), "/content")
	if s.db == nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	var key, mime, name string
	if err := s.db.QueryRow("SELECT storage_key,mime,filename FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key, &mime, &name); err != nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	if s.redirectStoredObject(w, r, key) {
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		s.error(w, 404, "ASSET_FILE_NOT_FOUND", "资产文件不存在")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Disposition", mimepkg.FormatMediaType("inline", map[string]string{"filename": name}))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, file)
}

// assetIDFromPath 从 /v1/assets/{id} 或 /v1/assets/{id}/content 取资产 id。
func assetIDFromPath(path string) string {
	return strings.TrimSuffix(strings.TrimPrefix(path, "/v1/assets/"), "/content")
}

// deleteAsset 删除一张资产（资产库里的单张图片），并把它从任务结果里移除。
func (s *Service) deleteAsset(w http.ResponseWriter, r *http.Request, id string) {
	userID, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if id == "" {
		s.error(w, http.StatusBadRequest, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	if s.db == nil {
		s.error(w, http.StatusServiceUnavailable, "DATABASE_REQUIRED", "删除资产需要数据库服务")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "删除失败，请稍后重试")
		return
	}
	defer tx.Rollback()
	key, err := repository.DeleteAsset(tx, userID, id)
	if err == repository.ErrTaskActive {
		s.error(w, 409, "ASSET_IN_USE", "素材正在用于生成，请等待任务完成后再删除")
		return
	}
	if err == sql.ErrNoRows {
		s.error(w, http.StatusNotFound, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	if err != nil {
		s.error(w, http.StatusInternalServerError, "ASSET_STORAGE_ERROR", "删除失败，请稍后重试")
		return
	}
	if err := tx.Commit(); err != nil {
		s.error(w, 500, "ASSET_STORAGE_ERROR", "删除失败，请稍后重试")
		return
	}
	if key != "" && s.storage != nil {
		_ = s.deleteAssetFiles(key)
	}
	s.json(w, http.StatusOK, map[string]any{"deleted": id})
}
