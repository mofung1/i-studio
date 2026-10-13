package main

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func (s *server) downloadTaskImages(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	uid, ok := s.authenticatedUserID(r)
	if !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.db == nil {
		s.error(w, 503, "TASK_DOWNLOAD_UNAVAILABLE", "图片打包服务暂时不可用")
		return
	}
	record, exists, err := dbFindTask(s.db, id, uid)
	if err != nil {
		s.error(w, 500, "TASK_STORAGE_ERROR", "记录读取失败")
		return
	}
	if !exists {
		s.error(w, 404, "GENERATION_TASK_NOT_FOUND", "生成任务不存在")
		return
	}
	if len(record.ResultImages) == 0 || len(record.ResultImages) > 16 {
		s.error(w, 400, "TASK_IMAGES_UNAVAILABLE", "这条记录没有可打包的图片")
		return
	}
	files := []io.ReadCloser{}
	names := []string{}
	defer func() {
		for _, file := range files {
			_ = file.Close()
		}
	}()
	for index, path := range record.ResultImages {
		if !strings.HasPrefix(path, "/v1/assets/") || !strings.HasSuffix(path, "/content") {
			s.error(w, 400, "TASK_IMAGES_UNAVAILABLE", "部分图片暂时无法打包，请单独下载")
			return
		}
		assetID := strings.TrimSuffix(strings.TrimPrefix(path, "/v1/assets/"), "/content")
		var key, mime string
		if err := s.db.QueryRow("SELECT storage_key,mime FROM assets WHERE id=$1 AND user_id=$2", assetID, uid).Scan(&key, &mime); err != nil {
			s.error(w, 404, "TASK_IMAGES_UNAVAILABLE", "部分图片不存在或无权访问")
			return
		}
		file, err := s.storage.Open(key)
		if err != nil {
			s.error(w, 404, "TASK_IMAGES_UNAVAILABLE", "部分图片文件已不可用")
			return
		}
		files = append(files, file)
		label := "图片"
		if index < len(record.ResultModules) {
			if name, _ := clothingModule(record.ResultModules[index]); name != "" {
				label = name
			}
		}
		extension := extensionForMime(mime)
		if extension == "" {
			extension = ".png"
		}
		names = append(names, fmt.Sprintf("%02d_%s%s", index+1, label, extension))
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="clothing-images.zip"`)
	w.Header().Set("Cache-Control", "no-store")
	archive := zip.NewWriter(w)
	defer archive.Close()
	for index, file := range files {
		entry, err := archive.Create(names[index])
		if err != nil {
			return
		}
		if _, err := io.Copy(entry, file); err != nil {
			return
		}
	}
}
