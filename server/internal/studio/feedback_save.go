package studio

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/istudio/server/internal/idgen"
)

const feedbackImageLimit = 5 << 20

type feedbackUpload struct {
	data          []byte
	mime, ext     string
	width, height int
}

// Only the pathname is retained: query parameters can contain private prompts or tokens.
func feedbackPagePath(raw string) (string, error) {
	if raw == "" {
		return "/", nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/") || strings.ContainsAny(u.Path, "\\\r\n\x00") || len(u.Path) > 500 {
		return "", errors.New("invalid feedback page")
	}
	return path.Clean(u.Path), nil
}

func (s *Service) feedbackCreate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<20)
	if err := r.ParseMultipartForm(16 << 20); err != nil {
		s.error(w, 400, "FEEDBACK_INVALID", "反馈上传无效，最多 3 张图片，每张不超过 5MB")
		return
	}
	defer r.MultipartForm.RemoveAll()
	content := strings.TrimSpace(r.FormValue("content"))
	requestKey := r.FormValue("requestKey")
	pagePath, err := feedbackPagePath(r.FormValue("pagePath"))
	if err != nil || !utf8.ValidString(content) || utf8.RuneCountInString(content) < 1 || utf8.RuneCountInString(content) > 2000 || len(requestKey) < 8 || len(requestKey) > 100 {
		s.error(w, 400, "FEEDBACK_INVALID", "请填写 1–2000 字的反馈内容")
		return
	}
	headers := r.MultipartForm.File["images"]
	fileCount := 0
	for _, files := range r.MultipartForm.File {
		fileCount += len(files)
	}
	if len(headers) > 3 || fileCount != len(headers) {
		s.error(w, 400, "FEEDBACK_IMAGE_LIMIT", "最多上传 3 张图片")
		return
	}
	images := make([]feedbackUpload, 0, len(headers))
	digests := make([]string, 0, len(headers))
	for _, header := range headers {
		if header.Size <= 0 || header.Size > feedbackImageLimit {
			s.error(w, 400, "FEEDBACK_IMAGE_INVALID", "每张图片不能超过 5MB")
			return
		}
		file, openErr := header.Open()
		if openErr != nil {
			s.feedbackFailure(w)
			return
		}
		data, readErr := io.ReadAll(io.LimitReader(file, feedbackImageLimit+1))
		_ = file.Close()
		mime := http.DetectContentType(data)
		ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
		config, format, decodeErr := image.DecodeConfig(bytes.NewReader(data))
		expected := map[string]string{"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp"}[mime]
		if readErr != nil || len(data) > feedbackImageLimit || ext == "" || decodeErr != nil || format != expected || config.Width <= 0 || config.Height <= 0 || int64(config.Width) > maxThumbnailPixels/int64(config.Height) {
			s.error(w, 400, "FEEDBACK_IMAGE_INVALID", "请选择有效的 JPG、PNG 或 WebP 图片，每张不超过 5MB、1 亿像素")
			return
		}
		images = append(images, feedbackUpload{data: data, mime: mime, ext: ext, width: config.Width, height: config.Height})
		sum := sha256.Sum256(data)
		digests = append(digests, hex.EncodeToString(sum[:]))
	}
	encoded, _ := json.Marshal(struct {
		Content, Page string
		Images        []string
	}{content, pagePath, digests})
	sum := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(sum[:])
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.feedbackFailure(w)
		return
	}
	defer tx.Rollback()
	var locked string
	if err = tx.QueryRowContext(r.Context(), "SELECT id FROM users WHERE id=$1 FOR UPDATE", uid).Scan(&locked); err != nil {
		s.feedbackFailure(w)
		return
	}
	var existingID, existingHash string
	err = tx.QueryRowContext(r.Context(), "SELECT id,input_hash FROM feedback WHERE user_id=$1 AND request_key=$2", uid, requestKey).Scan(&existingID, &existingHash)
	if err == nil {
		if existingHash != fingerprint {
			s.error(w, 409, "IDEMPOTENCY_CONFLICT", "提交编号已用于其他反馈，请重新打开后提交")
			return
		}
		s.json(w, 200, map[string]string{"id": existingID})
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		s.feedbackFailure(w)
		return
	}
	var used int
	if err = tx.QueryRowContext(r.Context(), "SELECT count(*) FROM feedback WHERE user_id=$1 AND created_at>="+platformDaySQL, uid).Scan(&used); err != nil {
		s.feedbackFailure(w)
		return
	}
	if used >= 5 {
		s.error(w, 429, "FEEDBACK_DAILY_LIMIT", "今天已提交 5 条反馈，请明天再试")
		return
	}
	id := idgen.New()
	if _, err = tx.ExecContext(r.Context(), "INSERT INTO feedback(id,user_id,request_key,input_hash,content,page_path) VALUES($1,$2,$3,$4,$5,$6)", id, uid, requestKey, fingerprint, content, pagePath); err != nil {
		s.feedbackFailure(w)
		return
	}
	keys := make([]string, 0, len(images))
	committed := false
	defer func() {
		if !committed {
			for _, key := range keys {
				_ = s.storage.Delete(key)
			}
		}
	}()
	for i, img := range images {
		key := s.newStorageKey(path.Join("user", time.Now().In(generationStorageLocation).Format("20060102"), "feedback", id+"-"+strconv.Itoa(i+1)+img.ext))
		// Track before Save: a backend may leave a partial object when Save fails.
		keys = append(keys, key)
		if err = s.storage.Save(key, bytes.NewReader(img.data)); err != nil {
			s.feedbackFailure(w)
			return
		}
		if _, err = tx.ExecContext(r.Context(), "INSERT INTO feedback_images(feedback_id,position,storage_key,mime,size_bytes,width,height) VALUES($1,$2,$3,$4,$5,$6,$7)", id, i+1, key, img.mime, len(img.data), img.width, img.height); err != nil {
			s.feedbackFailure(w)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		s.feedbackFailure(w)
		return
	}
	committed = true
	s.json(w, 201, map[string]string{"id": id})
}
