package studio

import (
	"archive/zip"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"unicode"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
)

var commerceDownloadModuleLabels = func() map[string]string {
	labels := map[string]string{}
	for _, template := range generationPromptDefinitions() {
		if strings.HasPrefix(template.Key, "module.product-main.") || strings.HasPrefix(template.Key, "module.detail-page.") {
			_, label, _ := strings.Cut(template.Name, " · ")
			labels[template.Key] = label
		}
	}
	return labels
}()

func (s *Service) downloadTaskImages(w http.ResponseWriter, r *http.Request, id string) {
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
	record, exists, err := repository.TaskByID(s.db, id, uid)
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
	input, _ := record.Input.(map[string]any)
	taskType := domain.TaskInputField(input, "taskType")
	generatedModel := taskType == "clothing-set" && domain.TaskInputField(input, "clothingModelSource") == "generated"
	shots, _ := input["clothingPlan"].([]any)
	archiveFailed := func() {
		s.error(w, http.StatusInternalServerError, "TASK_ARCHIVE_FAILED", "图片打包失败，未下载 ZIP，请重试")
	}
	// Complete the archive before sending success so a storage failure cannot look like a finished download.
	temp, err := os.CreateTemp("", "istudio-task-download-*.zip")
	if err != nil {
		archiveFailed()
		return
	}
	defer func() {
		_ = temp.Close()
		_ = os.Remove(temp.Name())
	}()
	archive := zip.NewWriter(temp)
	for index, path := range record.ResultImages {
		if r.Context().Err() != nil {
			return
		}
		if !strings.HasPrefix(path, "/v1/assets/") || !strings.HasSuffix(path, "/content") {
			s.error(w, 400, "TASK_IMAGES_UNAVAILABLE", "部分图片暂时无法打包，请单独下载")
			return
		}
		var key, imageMime, module string
		var position int
		var size int64
		// Use the saved position by asset ID so removing an earlier image cannot shift later shot labels.
		err := s.db.QueryRowContext(r.Context(), `
			SELECT a.storage_key,a.mime,a.size_bytes,COALESCE(d.position,0),COALESCE(d.module_key,'')
			FROM assets a
			LEFT JOIN generation_deliveries d ON d.task_id=$3 AND d.task_id=a.task_id AND d.asset_id=a.id AND d.status='saved'
			WHERE a.id=$1 AND a.user_id=$2`,
			assetIDFromPath(path), uid, id).Scan(&key, &imageMime, &size, &position, &module)
		if err != nil {
			s.error(w, 404, "TASK_IMAGES_UNAVAILABLE", "部分图片不存在或无权访问")
			return
		}
		if module == "" && index < len(record.ResultModules) {
			module = record.ResultModules[index]
		}
		label := downloadModuleLabel(taskType, module)
		if generatedModel && position > 0 && position <= len(shots) {
			shot := shots[position-1]
			if domain.TaskInputField(shot, "moduleKey") == module {
				if shotLabel := safeShotFilename(domain.TaskInputField(shot, "label")); shotLabel != "" {
					label = shotLabel
				}
			}
		}
		extension := extensionForMime(imageMime)
		if extension == "" {
			extension = ".png"
		}
		name := fmt.Sprintf("%02d_%s%s", index+1, label, extension)
		entry, err := archive.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store})
		if err != nil {
			archiveFailed()
			return
		}
		file, err := s.storage.Open(key)
		if err != nil {
			s.error(w, 404, "TASK_IMAGES_UNAVAILABLE", "部分图片文件已不可用")
			return
		}
		source := io.Reader(file)
		// Copy at most one extra byte to detect an oversized object without staging all of it.
		if size > 0 && size < math.MaxInt64 {
			source = io.LimitReader(file, size+1)
		}
		written, err := io.Copy(entry, source)
		closeErr := file.Close()
		if err != nil || closeErr != nil || written == 0 || (size > 0 && written != size) {
			archiveFailed()
			return
		}
	}
	if err := archive.Close(); err != nil {
		archiveFailed()
		return
	}
	info, err := temp.Stat()
	if err != nil {
		archiveFailed()
		return
	}
	if _, err := temp.Seek(0, io.SeekStart); err != nil {
		archiveFailed()
		return
	}
	imageCount := len(record.ResultImages)
	expectedCount := max(imageCount, intValue(input["count"], imageCount))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", taskDownloadDisposition(taskType, generatedModel, record.Status != "succeeded", expectedCount-imageCount))
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("X-Archive-Image-Count", strconv.Itoa(imageCount))
	w.Header().Set("X-Archive-Expected-Count", strconv.Itoa(expectedCount))
	w.Header().Set("Cache-Control", "no-store")
	// With a fixed Content-Length, an interrupted response is a failed download to the browser.
	_, _ = io.Copy(w, temp)
}

func downloadModuleLabel(taskType, module string) string {
	if label := commerceDownloadModuleLabels["module."+taskType+"."+module]; label != "" {
		return label
	}
	if label, _ := clothingModule(module); label != "" {
		return label
	}
	return "图片"
}

func safeShotFilename(label string) string {
	label = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || strings.ContainsRune("/\\:*?\"<>|", r) {
			return '_'
		}
		return r
	}, label)
	runes := []rune(strings.Trim(label, " ._"))
	if len(runes) > 48 {
		runes = runes[:48]
	}
	return strings.TrimSpace(string(runes))
}

func taskDownloadDisposition(taskType string, generatedModel, unfinished bool, missing int) string {
	fallback := "clothing-images.zip"
	var name string
	switch taskType {
	case "product-main":
		fallback, name = "product-main-images.zip", "商品上架套图"
	case "detail-page":
		fallback, name = "detail-page-images.zip", "商品详情套图"
	case "clothing-set":
		name = "服装组图"
		if generatedModel {
			name = "模特上身套图"
		}
	}
	if missing > 0 {
		fallback = strings.TrimSuffix(fallback, ".zip") + fmt.Sprintf("-missing-%d.zip", missing)
	}
	params := map[string]string{"filename": fallback}
	if name != "" {
		switch {
		case missing > 0:
			name += fmt.Sprintf("-缺%d张", missing)
		case unfinished:
			name += "-已完成图片"
		}
		params["filename*"] = "UTF-8''" + url.PathEscape(name+".zip")
	}
	return mime.FormatMediaType("attachment", params)
}
