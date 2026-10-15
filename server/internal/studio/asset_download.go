package studio

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

func (s *Service) libraryDownload(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	var input struct {
		IDs []string `json:"ids"`
	}
	if !decode(r, &input) || len(input.IDs) == 0 || len(input.IDs) > 100 {
		s.error(w, 400, "ASSET_INPUT_INVALID", "一次可下载 1–100 张图片")
		return
	}
	files := []io.ReadCloser{}
	names := []string{}
	seen := map[string]bool{}
	var total int64
	defer func() {
		for _, file := range files {
			_ = file.Close()
		}
	}()
	for _, id := range input.IDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		var key, name, mime string
		var size int64
		if s.db.QueryRow("SELECT storage_key,COALESCE(NULLIF(title,''),filename),mime,size_bytes FROM assets WHERE id=$1 AND user_id=$2", id, uid).Scan(&key, &name, &mime, &size) != nil {
			s.error(w, 404, "ASSET_NOT_FOUND", "部分图片不存在或无权访问")
			return
		}
		total += size
		if total > 250<<20 {
			s.error(w, 400, "DOWNLOAD_TOO_LARGE", "单次下载最多 250 MB，请分批选择")
			return
		}
		file, err := s.storage.Open(key)
		if err != nil {
			s.error(w, 404, "ASSET_FILE_NOT_FOUND", "部分图片文件无法读取")
			return
		}
		files = append(files, file)
		name = strings.TrimSuffix(filepath.Base(strings.ReplaceAll(name, "\\", "/")), filepath.Ext(name))
		name = strings.Map(func(c rune) rune {
			if c < ' ' || strings.ContainsRune("/\\:", c) {
				return '_'
			}
			return c
		}, name)
		names = append(names, fmt.Sprintf("%03d_%s%s", len(files), name, extensionForMime(mime)))
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="istudio-assets.zip"`)
	archive := zip.NewWriter(w)
	defer archive.Close()
	for index, file := range files {
		entry, err := archive.Create(names[index])
		if err != nil {
			return
		}
		if _, err = io.Copy(entry, file); err != nil {
			return
		}
	}
}
