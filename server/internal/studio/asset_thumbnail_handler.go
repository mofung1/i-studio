package studio

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/istudio/server/internal/domain"
)

var thumbnailSlots = make(chan struct{}, 2)

func (s *Service) assetThumbnail(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/assets/"), "/thumbnail")
	var key, thumbnailKey string
	if s.db.QueryRow("SELECT storage_key,thumbnail_key FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key, &thumbnailKey) != nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "资产不存在")
		return
	}
	serveCached := func() bool {
		if thumbnailKey == "" {
			return false
		}
		if s.redirectStoredObject(w, r, thumbnailKey) {
			return true
		}
		file, err := s.storage.Open(thumbnailKey)
		if err != nil {
			return false
		}
		defer file.Close()
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, max-age=300")
		_, _ = io.Copy(w, file)
		return true
	}
	if serveCached() {
		return
	}
	select {
	case thumbnailSlots <- struct{}{}:
		defer func() { <-thumbnailSlots }()
	case <-r.Context().Done():
		return
	}
	// Another request may have created this thumbnail while waiting for a slot.
	_ = s.db.QueryRow("SELECT thumbnail_key FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&thumbnailKey)
	if serveCached() {
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		s.error(w, 404, "ASSET_FILE_NOT_FOUND", "图片文件不存在")
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, domain.MaxGeneratedImageBytes+1))
	if err != nil || len(raw) > domain.MaxGeneratedImageBytes {
		s.error(w, 400, "IMAGE_INVALID", "图片无法读取")
		return
	}
	encoded, err := generateAssetThumbnail(r.Context(), raw)
	if err != nil {
		if r.Context().Err() != nil {
			return
		}
		if errors.Is(err, errThumbnailSize) {
			s.error(w, 413, "IMAGE_PREVIEW_TOO_LARGE", err.Error())
		} else {
			s.error(w, 400, "IMAGE_INVALID", "图片无法读取，请检查原图是否完整")
		}
		return
	}

	thumbnailKey = key + ".thumbnail-v1.jpg"
	if err := s.storage.Save(thumbnailKey, bytes.NewReader(encoded)); err == nil {
		result, err := s.db.Exec("UPDATE assets SET thumbnail_key=$1 WHERE id=$2 AND user_id=$3 AND storage_key=$4", thumbnailKey, id, uid, key)
		if err == nil {
			if count, _ := result.RowsAffected(); count == 0 {
				_ = s.storage.Delete(thumbnailKey)
			}
		}
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=300")
	_, _ = w.Write(encoded)
}
