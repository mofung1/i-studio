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
	"strconv"
	"strings"
	"time"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

type submissionInput struct {
	Title             string `json:"title"`
	CategoryID        string `json:"categoryId"`
	Prompt            string `json:"prompt"`
	Instructions      string `json:"instructions"`
	RequiresReference bool   `json:"requiresReference"`
	CoverAssetID      string `json:"coverAssetId"`
	PersonalPromptID  string `json:"personalPromptId"`
	Version           int    `json:"version"`
	RequestKey        string `json:"requestKey"`
	PublishConsent    bool   `json:"publishConsent"`
}

func digestSubmission(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func (s *Service) saveInspirationSubmission(w http.ResponseWriter, r *http.Request, uid, id string) {
	var input submissionInput
	if !decode(r, &input) {
		s.error(w, 400, "SUBMISSION_INVALID", "投稿格式不正确")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Prompt = strings.TrimSpace(input.Prompt)
	input.Instructions = strings.TrimSpace(input.Instructions)
	if input.Title == "" || len([]rune(input.Title)) > 160 || input.Prompt == "" || len([]rune(input.Prompt)) > 20000 || len([]rune(input.Instructions)) > 1000 || input.CategoryID == "" || len(input.RequestKey) < 8 || len(input.RequestKey) > 100 || !input.PublishConsent {
		s.error(w, 400, "SUBMISSION_INVALID", "请填写标题、分类、提示词，并确认审核通过后公开内容；标题最多 160 字，提示词最多 20000 字，使用说明最多 1000 字")
		return
	}
	encoded, _ := json.Marshal(input)
	fingerprint := digestSubmission(encoded)
	// Resolve retries before image processing; deleted source assets do not break a committed retry.
	var retryID string
	var oldHash string
	err := s.db.QueryRowContext(r.Context(), "SELECT submission_id,input_hash FROM inspiration_submission_revisions WHERE user_id=$1 AND request_key=$2", uid, input.RequestKey).Scan(&retryID, &oldHash)
	if err == nil {
		if oldHash != fingerprint || (id != "" && id != retryID) {
			s.error(w, 409, "IDEMPOTENCY_CONFLICT", "提交编号已用于其他内容")
			return
		}
		s.writeInspirationSubmission(w, r, retryID, uid, false)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		s.submissionFailure(w, err)
		return
	}
	cover, err := s.prepareSubmissionCover(r, uid, id, input)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(cover))
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	tx, err := repository.BeginInspirationEdit(s.db)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	defer tx.Rollback()
	var settings submissionSettings
	if err = tx.QueryRowContext(r.Context(), "SELECT enabled,daily_limit FROM inspiration_submission_settings WHERE id=true FOR SHARE").Scan(&settings.Enabled, &settings.DailyLimit); err != nil {
		s.submissionFailure(w, err)
		return
	}
	if !settings.Enabled {
		s.error(w, 409, "SUBMISSIONS_CLOSED", "投稿暂未开放，已提交的内容仍可查看")
		return
	}
	version := 1
	var currentStatus string
	if id != "" {
		err = tx.QueryRowContext(r.Context(), `SELECT s.current_version,r.status FROM inspiration_submissions s JOIN inspiration_submission_revisions r ON r.submission_id=s.id AND r.version=s.current_version WHERE s.id=$1 AND s.user_id=$2 FOR UPDATE OF s`, id, uid).Scan(&version, &currentStatus)
		if errors.Is(err, sql.ErrNoRows) {
			s.error(w, 404, "SUBMISSION_NOT_FOUND", "投稿不存在")
			return
		}
		if err != nil {
			s.submissionFailure(w, err)
			return
		}
	}
	if err = lockSubmissionOwner(r.Context(), tx, uid); err != nil {
		s.submissionFailure(w, err)
		return
	}
	// The shared edit lock also serializes concurrent retries across API processes.
	err = tx.QueryRowContext(r.Context(), "SELECT submission_id,input_hash FROM inspiration_submission_revisions WHERE user_id=$1 AND request_key=$2", uid, input.RequestKey).Scan(&retryID, &oldHash)
	if err == nil {
		if oldHash != fingerprint || (id != "" && id != retryID) {
			s.error(w, 409, "IDEMPOTENCY_CONFLICT", "提交编号已用于其他内容")
			return
		}
		_ = tx.Rollback()
		s.writeInspirationSubmission(w, r, retryID, uid, false)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		s.submissionFailure(w, err)
		return
	}
	if id != "" {
		if version != input.Version || currentStatus == "pending" {
			s.error(w, 409, "SUBMISSION_VERSION_CONFLICT", "投稿已更新或仍在审核，请刷新后操作；待审核内容请先撤回")
			return
		}
		version++
	}
	var used int
	if err = tx.QueryRowContext(r.Context(), `SELECT count(*) FROM inspiration_submission_revisions WHERE user_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`, uid).Scan(&used); err != nil {
		s.submissionFailure(w, err)
		return
	}
	if used >= settings.DailyLimit {
		s.error(w, 429, "SUBMISSION_DAILY_LIMIT", "今日投稿次数已达上限，修改重提也计入次数，请明天再试")
		return
	}
	var category string
	if err = tx.QueryRowContext(r.Context(), "SELECT name FROM inspiration_categories WHERE id=$1", input.CategoryID).Scan(&category); errors.Is(err, sql.ErrNoRows) {
		s.error(w, 400, "SUBMISSION_CATEGORY_INVALID", "分类已变更，请重新选择")
		return
	} else if err != nil {
		s.submissionFailure(w, err)
		return
	}
	contentHash := digestSubmission([]byte(strings.Join(strings.Fields(input.Prompt), " ")))
	var duplicate bool
	if err = tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM inspiration_submission_revisions WHERE user_id=$1 AND content_hash=$2 AND submission_id<>$3)", uid, contentHash, id).Scan(&duplicate); err != nil {
		s.submissionFailure(w, err)
		return
	}
	if duplicate {
		s.error(w, 409, "SUBMISSION_DUPLICATE", "这段提示词已有投稿，请在我的投稿中查看或修改原投稿")
		return
	}
	if id == "" && input.PersonalPromptID != "" {
		var own bool
		err = tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM personal_prompts WHERE id=$1 AND user_id=$2 AND kind='prompt' AND deleted_at IS NULL)", input.PersonalPromptID, uid).Scan(&own)
		if err != nil {
			s.submissionFailure(w, err)
			return
		}
		if !own {
			s.error(w, 404, "PERSONAL_PROMPT_NOT_FOUND", "个人提示词不存在")
			return
		}
		if err = tx.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM inspiration_submissions WHERE user_id=$1 AND personal_prompt_id=$2)", uid, input.PersonalPromptID).Scan(&duplicate); err != nil {
			s.submissionFailure(w, err)
			return
		}
		if duplicate {
			s.error(w, 409, "SUBMISSION_DUPLICATE", "该个人提示词已有投稿，请在我的投稿中修改")
			return
		}
	}
	if err = s.ensureStorageCapacity(r.Context(), tx, uid, int64(len(cover))); err != nil {
		s.submissionFailure(w, err)
		return
	}
	if id == "" {
		id = idgen.New()
		_, err = tx.ExecContext(r.Context(), `INSERT INTO inspiration_submissions(id,user_id,personal_prompt_id,request_key,input_hash,publication_id) VALUES($1,$2,$3,$4,$5,$6)`, id, uid, repository.NullableString(input.PersonalPromptID), input.RequestKey, fingerprint, "community_"+id)
	} else {
		_, err = tx.ExecContext(r.Context(), "UPDATE inspiration_submissions SET current_version=$2,updated_at=now() WHERE id=$1", id, version)
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	key := s.newStorageKey("user/" + time.Now().In(generationStorageLocation).Format("20060102") + "/submissions/" + id + "-v" + strconv.Itoa(version) + ".jpg")
	defer func() { _ = tx.Rollback(); s.removeUnusedSubmissionFile(key) }()
	if err = s.storage.Save(key, bytes.NewReader(cover)); err != nil {
		s.submissionFailure(w, err)
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO inspiration_submission_revisions(submission_id,version,user_id,request_key,input_hash,title,content_hash,category_id,category,prompt,instructions,requires_reference,cover_key,width,height,cover_bytes,storage_bytes)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`, id, version, uid, input.RequestKey, fingerprint, input.Title, contentHash, input.CategoryID, category, input.Prompt, input.Instructions, input.RequiresReference, key, config.Width, config.Height, len(cover))
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	item, err := scanSubmission(s.db.QueryRowContext(r.Context(), "SELECT "+submissionColumns+submissionFrom+" WHERE s.id=$1", id), false)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	s.json(w, 201, map[string]any{"submission": item})
}

func (s *Service) prepareSubmissionCover(r *http.Request, uid, id string, input submissionInput) ([]byte, error) {
	var key string
	var err error
	if input.CoverAssetID != "" {
		err = s.db.QueryRowContext(r.Context(), "SELECT storage_key FROM assets WHERE id=$1 AND user_id=$2 AND hidden_at IS NULL", input.CoverAssetID, uid).Scan(&key)
	} else if id != "" {
		err = s.db.QueryRowContext(r.Context(), `SELECT r.cover_key FROM inspiration_submission_revisions r JOIN inspiration_submissions s ON s.id=r.submission_id WHERE s.id=$1 AND s.user_id=$2 AND r.version=$3`, id, uid, input.Version).Scan(&key)
	} else {
		err = sql.ErrNoRows
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &operationError{400, "SUBMISSION_COVER_REQUIRED", "请选择自己账号中的效果封面"}
	}
	if err != nil {
		return nil, err
	}
	file, err := s.storage.Open(key)
	if err != nil {
		return nil, &operationError{400, "SUBMISSION_COVER_MISSING", "封面无法读取，请重新选择"}
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, domain.MaxGeneratedImageBytes+1))
	if err != nil || len(raw) > domain.MaxGeneratedImageBytes {
		return nil, &operationError{400, "SUBMISSION_COVER_INVALID", "封面图片过大或不完整，请重新选择"}
	}
	select {
	case thumbnailSlots <- struct{}{}:
		defer func() { <-thumbnailSlots }()
	case <-r.Context().Done():
		return nil, r.Context().Err()
	}
	cover, err := generateAssetPreview(r.Context(), raw, 1280)
	if err != nil {
		return nil, &operationError{400, "SUBMISSION_COVER_INVALID", "封面无法处理，请缩小图片后重试"}
	}
	return cover, nil
}

// Keep files after an ambiguous commit error unless the database confirms they are unreferenced.
func (s *Service) removeUnusedSubmissionFile(key string) {
	var used bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM inspiration_submission_revisions WHERE cover_key=$1 OR public_key=$1) OR EXISTS(SELECT 1 FROM inspiration_prompts WHERE image_key=$1)`, key).Scan(&used)
	if err == nil && !used {
		if err = s.storage.Delete(key); err != nil {
			_, _ = s.db.Exec("INSERT INTO storage_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING", key)
		}
	}
}

func submissionConflict() error {
	return &operationError{409, "SUBMISSION_VERSION_CONFLICT", "投稿已被处理，请刷新后重试"}
}
