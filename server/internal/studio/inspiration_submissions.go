package studio

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type submissionSettings struct {
	Enabled    bool `json:"enabled"`
	DailyLimit int  `json:"dailyLimit"`
}

type inspirationSubmission struct {
	ID                string     `json:"id"`
	UserID            string     `json:"userId,omitempty"`
	Username          string     `json:"username,omitempty"`
	PersonalPromptID  string     `json:"personalPromptId"`
	Version           int        `json:"version"`
	PublishedVersion  int        `json:"publishedVersion"`
	PublicationID     string     `json:"publicationId"`
	Published         bool       `json:"published"`
	RewardMinor       int64      `json:"rewardMinor"`
	Title             string     `json:"title"`
	CategoryID        string     `json:"categoryId"`
	Category          string     `json:"category"`
	Prompt            string     `json:"prompt"`
	Instructions      string     `json:"instructions"`
	RequiresReference bool       `json:"requiresReference"`
	CoverPath         string     `json:"coverPath"`
	Width             int        `json:"width"`
	Height            int        `json:"height"`
	Status            string     `json:"status"`
	ReviewReason      string     `json:"reviewReason"`
	ReviewedAt        *time.Time `json:"reviewedAt"`
	CreatedAt         time.Time  `json:"createdAt"`
}

const submissionFrom = ` FROM inspiration_submissions s
 JOIN inspiration_submission_revisions r ON r.submission_id=s.id AND r.version=s.current_version
 JOIN users u ON u.id=s.user_id LEFT JOIN inspiration_prompts p ON p.id=s.publication_id `
const submissionColumns = `s.id,s.user_id,u.username,COALESCE(s.personal_prompt_id,''),s.current_version,s.published_version,s.publication_id,
 COALESCE(p.enabled,false),s.reward_minor,r.title,COALESCE(r.category_id,''),r.category,r.prompt,r.instructions,r.requires_reference,
 r.width,r.height,r.status,r.review_reason,r.reviewed_at,r.created_at`

func scanSubmission(row inspirationScanner, admin bool) (inspirationSubmission, error) {
	var item inspirationSubmission
	err := row.Scan(&item.ID, &item.UserID, &item.Username, &item.PersonalPromptID, &item.Version, &item.PublishedVersion, &item.PublicationID,
		&item.Published, &item.RewardMinor, &item.Title, &item.CategoryID, &item.Category, &item.Prompt, &item.Instructions, &item.RequiresReference,
		&item.Width, &item.Height, &item.Status, &item.ReviewReason, &item.ReviewedAt, &item.CreatedAt)
	prefix := "/v1/personal/inspiration-submissions/"
	if admin {
		prefix = "/v1/admin/inspiration-submissions/"
	} else {
		item.UserID = ""
		item.Username = ""
	}
	item.CoverPath = prefix + item.ID + "/cover?version=" + strconv.Itoa(item.Version)
	return item, err
}

func (s *Service) submissionFailure(w http.ResponseWriter, err error) {
	var problem *operationError
	if errors.As(err, &problem) {
		s.error(w, problem.status, problem.code, problem.message)
		return
	}
	if strings.Contains(err.Error(), "account storage quota exceeded") {
		s.error(w, 413, "ACCOUNT_STORAGE_QUOTA", "账号存储额度不足，请清理不再使用的素材后重试")
		return
	}
	s.error(w, 503, "SUBMISSION_UNAVAILABLE", "投稿暂时无法处理，请稍后重试")
}

func (s *Service) inspirationSubmissionSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	admin := strings.HasPrefix(r.URL.Path, "/v1/admin/")
	if admin && !s.requireAdmin(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "投稿需要连接数据库")
		return
	}
	if r.Method == http.MethodPut {
		var input submissionSettings
		if !decode(r, &input) || input.DailyLimit < 1 || input.DailyLimit > 100 {
			s.error(w, 400, "SUBMISSION_SETTINGS_INVALID", "每日投稿上限需为 1–100 次")
			return
		}
		if _, err := s.db.ExecContext(r.Context(), "UPDATE inspiration_submission_settings SET enabled=$1,daily_limit=$2 WHERE id=true", input.Enabled, input.DailyLimit); err != nil {
			s.submissionFailure(w, err)
			return
		}
		if actor, ok := s.currentAdministrator(r); ok {
			s.audit(actor.ID, "inspiration.submission.settings", "", fmt.Sprintf("enabled=%t dailyLimit=%d", input.Enabled, input.DailyLimit))
		}
	}
	var settings submissionSettings
	if err := s.db.QueryRowContext(r.Context(), "SELECT enabled,daily_limit FROM inspiration_submission_settings WHERE id=true").Scan(&settings.Enabled, &settings.DailyLimit); err != nil {
		s.submissionFailure(w, err)
		return
	}
	rows, err := s.db.QueryContext(r.Context(), "SELECT id,name FROM inspiration_categories ORDER BY name,id")
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	defer rows.Close()
	categories := []map[string]string{}
	for rows.Next() {
		var id, name string
		if err = rows.Scan(&id, &name); err != nil {
			s.submissionFailure(w, err)
			return
		}
		categories = append(categories, map[string]string{"id": id, "category": name})
	}
	if err = rows.Err(); err != nil {
		s.submissionFailure(w, err)
		return
	}
	s.json(w, 200, map[string]any{"settings": settings, "categories": categories})
}

func (s *Service) inspirationSubmissions(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.saveInspirationSubmission(w, r, uid, "")
		return
	}
	s.listInspirationSubmissions(w, r, uid, false)
}

func (s *Service) adminInspirationSubmissions(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	s.listInspirationSubmissions(w, r, "", true)
}

func (s *Service) listInspirationSubmissions(w http.ResponseWriter, r *http.Request, uid string, admin bool) {
	w.Header().Set("Cache-Control", "no-store")
	if s.db == nil {
		s.error(w, 503, "DATABASE_REQUIRED", "投稿需要连接数据库")
		return
	}
	where := " WHERE true"
	args := []any{}
	if !admin {
		args = append(args, uid)
		where += " AND s.user_id=$1"
	}
	if personalID := r.URL.Query().Get("personalPromptId"); personalID != "" {
		args = append(args, personalID)
		where += fmt.Sprintf(" AND s.personal_prompt_id=$%d", len(args))
	}
	if status := r.URL.Query().Get("status"); status != "" && status != "all" {
		if _, valid := stringSet("pending", "approved", "rejected", "withdrawn")[status]; !valid {
			s.error(w, 400, "SUBMISSION_STATUS_INVALID", "投稿状态无效")
			return
		}
		args = append(args, status)
		where += fmt.Sprintf(" AND r.status=$%d", len(args))
	}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		where += fmt.Sprintf(" AND (r.title ILIKE $%d OR s.id=$%d", len(args), len(args))
		if admin {
			where += fmt.Sprintf(" OR u.username ILIKE $%d", len(args))
		}
		where += ")"
	}
	var total int
	if err := s.db.QueryRowContext(r.Context(), "SELECT count(*)"+submissionFrom+where, args...).Scan(&total); err != nil {
		s.submissionFailure(w, err)
		return
	}
	page := clampInt(parseQueryInt(r.URL.Query().Get("page"), 1), 1, max(1, (total+19)/20))
	rows, err := s.db.QueryContext(r.Context(), "SELECT "+submissionColumns+submissionFrom+where+fmt.Sprintf(" ORDER BY r.created_at DESC,s.id DESC LIMIT 20 OFFSET $%d", len(args)+1), append(args, (page-1)*20)...)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	defer rows.Close()
	items := []inspirationSubmission{}
	for rows.Next() {
		item, e := scanSubmission(rows, admin)
		if e != nil {
			s.submissionFailure(w, e)
			return
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		s.submissionFailure(w, err)
		return
	}
	s.json(w, 200, map[string]any{"submissions": items, "page": page, "total": total, "totalPages": max(1, (total+19)/20)})
}

func (s *Service) inspirationSubmissionByID(w http.ResponseWriter, r *http.Request, id, action string) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if action == "cover" {
		s.serveSubmissionCover(w, r, id, uid, false)
		return
	}
	if action == "withdraw" {
		s.withdrawInspirationSubmission(w, r, id, uid)
		return
	}
	if r.Method == http.MethodPut {
		s.saveInspirationSubmission(w, r, uid, id)
		return
	}
	s.writeInspirationSubmission(w, r, id, uid, false)
}

func (s *Service) writeInspirationSubmission(w http.ResponseWriter, r *http.Request, id, uid string, admin bool) {
	where := " WHERE s.id=$1"
	args := []any{id}
	if !admin {
		where += " AND s.user_id=$2"
		args = append(args, uid)
	}
	item, err := scanSubmission(s.db.QueryRowContext(r.Context(), "SELECT "+submissionColumns+submissionFrom+where, args...), admin)
	if errors.Is(err, sql.ErrNoRows) {
		s.error(w, 404, "SUBMISSION_NOT_FOUND", "投稿不存在")
		return
	}
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	before := max(1, parseQueryInt(r.URL.Query().Get("beforeVersion"), item.Version+1))
	args = append(args, before)
	historyFrom := strings.Replace(submissionFrom, "AND r.version=s.current_version", "", 1)
	historyColumns := strings.Replace(submissionColumns, "s.current_version", "r.version", 1)
	rows, err := s.db.QueryContext(r.Context(), "SELECT "+historyColumns+historyFrom+where+fmt.Sprintf(" AND r.version<$%d ORDER BY r.version DESC LIMIT 21", len(args)), args...)
	if err != nil {
		s.submissionFailure(w, err)
		return
	}
	defer rows.Close()
	history := []inspirationSubmission{}
	for rows.Next() {
		entry, e := scanSubmission(rows, admin)
		if e != nil {
			s.submissionFailure(w, e)
			return
		}
		history = append(history, entry)
	}
	if err = rows.Err(); err != nil {
		s.submissionFailure(w, err)
		return
	}
	next := 0
	if len(history) > 20 {
		history = history[:20]
		next = history[19].Version
	}
	s.json(w, 200, map[string]any{"submission": item, "history": history, "nextBeforeVersion": next})
}

func lockSubmissionOwner(ctx context.Context, tx *sql.Tx, uid string) error {
	var status string
	if err := tx.QueryRowContext(ctx, "SELECT status FROM users WHERE id=$1 FOR UPDATE", uid).Scan(&status); err != nil {
		return err
	}
	if status != "active" {
		return &operationError{403, "ACCOUNT_DISABLED", "账号已停用"}
	}
	return nil
}
