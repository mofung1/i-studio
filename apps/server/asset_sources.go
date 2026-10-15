package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"io"
	"net/http"
	"strings"
)

// Ordered descriptors allow local files and owned assets in the same role.
type imageSource struct {
	AssetID   string `json:"assetId,omitempty"`
	FileIndex *int   `json:"fileIndex,omitempty"`
}

func (s *server) readImageSources(r *http.Request, field string, maximum, maxBytes int) ([]promptImage, int, error) {
	files := r.MultipartForm.File[field]
	sources := []imageSource{}
	if raw := r.FormValue(field + "Sources"); raw != "" {
		decoder := json.NewDecoder(strings.NewReader(raw))
		decoder.DisallowUnknownFields()
		if len(raw) > 8192 || decoder.Decode(&sources) != nil || decoder.Decode(new(any)) != io.EOF {
			return nil, 0, fmt.Errorf("素材选择无效")
		}
	} else {
		for i := range files {
			index := i
			sources = append(sources, imageSource{FileIndex: &index})
		}
	}
	if len(sources) > maximum || len(files) > maximum {
		return nil, 0, fmt.Errorf("最多选择 %d 张图片", maximum)
	}
	uid, _ := s.authenticatedUserID(r)
	used := map[int]bool{}
	images := []promptImage{}
	total := 0
	for _, source := range sources {
		var reader io.ReadCloser
		var err error
		readLimit := maxBytes
		storedPromptImage := source.AssetID != "" && field == "images"
		if storedPromptImage {
			readLimit = 10 << 20
		}
		if source.AssetID != "" && source.FileIndex == nil {
			var key string
			var size int64
			if s.db == nil || s.db.QueryRow("SELECT storage_key,size_bytes FROM assets WHERE id=$1 AND user_id=$2", source.AssetID, uid).Scan(&key, &size) != nil {
				return nil, 0, fmt.Errorf("素材不存在或无权访问")
			}
			if size > int64(readLimit) {
				return nil, 0, fmt.Errorf("图片超过大小限制")
			}
			reader, err = s.storage.Open(key)
		} else if source.AssetID == "" && source.FileIndex != nil && *source.FileIndex >= 0 && *source.FileIndex < len(files) && !used[*source.FileIndex] {
			index := *source.FileIndex
			used[index] = true
			if files[index].Size > int64(maxBytes) {
				return nil, 0, fmt.Errorf("图片超过大小限制")
			}
			reader, err = files[index].Open()
		} else {
			return nil, 0, fmt.Errorf("素材选择无效")
		}
		if err != nil {
			return nil, 0, errPromptImageUnreadable
		}
		data, err := io.ReadAll(io.LimitReader(reader, int64(readLimit)+1))
		_ = reader.Close()
		mime := http.DetectContentType(data)
		if err != nil || len(data) == 0 {
			return nil, 0, errPromptImageUnreadable
		}
		if len(data) > readLimit {
			return nil, 0, errPromptImageTooLarge
		}
		if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
			return nil, 0, fmt.Errorf("仅支持 JPG、PNG、WebP 图片")
		}
		if storedPromptImage {
			config, _, err := image.DecodeConfig(bytes.NewReader(data))
			if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40_000_000 {
				return nil, 0, errPromptImageUnreadable
			}
			data, err = prepareReverseAnalysisData(data, "high")
			if err != nil {
				return nil, 0, errPromptImageUnreadable
			}
			mime = http.DetectContentType(data)
		}
		if len(data) > maxBytes {
			return nil, 0, errPromptImageTooLarge
		}
		total += len(data)
		if total > 20<<20 {
			return nil, 0, fmt.Errorf("图片总计最多 20 MB")
		}
		images = append(images, promptImage{Mime: mime, Data: base64.StdEncoding.EncodeToString(data)})
	}
	if len(used) != len(files) {
		return nil, 0, fmt.Errorf("素材选择与上传文件不一致")
	}
	return images, total, nil
}

func (s *server) assetMetadata(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v1/assets/"), "/metadata")
	var a libraryAsset
	var tags []byte
	if s.db.QueryRow(`SELECT id,title,filename,mime,width,height,size_bytes,favorite,tags,COALESCE(project_id,''),created_at FROM assets WHERE id=$1 AND user_id=$2`, id, uid).Scan(&a.ID, &a.Title, &a.Filename, &a.Mime, &a.Width, &a.Height, &a.SizeBytes, &a.Favorite, &tags, &a.ProjectID, &a.CreatedAt) != nil {
		s.error(w, 404, "ASSET_NOT_FOUND", "素材不存在或无权访问")
		return
	}
	_ = json.Unmarshal(tags, &a.Tags)
	if a.Tags == nil {
		a.Tags = []string{}
	}
	a.ContentPath = "/v1/assets/" + a.ID + "/content"
	a.ThumbnailPath = "/v1/assets/" + a.ID + "/thumbnail"
	s.json(w, 200, map[string]any{"asset": a})
}

const assetReferenceSQL = `(COALESCE(input->'productAssetIds','[]'::jsonb) ? $2 OR COALESCE(input->'referenceAssetIds','[]'::jsonb) ? $2 OR input->>'modelAssetId'=$2 OR input->>'sceneAssetId'=$2)`

func assetReferences(q sqlQueryer, uid, id, exceptTask string) (int, int, error) {
	var count, active int
	err := q.QueryRow(`SELECT count(*),count(*) FILTER (WHERE status IN ('queued','processing','waiting_provider')) FROM generation_tasks WHERE user_id=$1 AND `+assetReferenceSQL+` AND id<>$3`, uid, id, exceptTask).Scan(&count, &active)
	return count, active, err
}

func stringsAssetReference(idColumn string) string {
	return strings.ReplaceAll(assetReferenceSQL, "$2", idColumn)
}
