package studio

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type userFeedback struct {
	ID         string     `json:"id"`
	Username   string     `json:"username"`
	Content    string     `json:"content"`
	PagePath   string     `json:"pagePath"`
	Status     string     `json:"status"`
	ImageCount int        `json:"imageCount"`
	CreatedAt  time.Time  `json:"createdAt"`
	HandledAt  *time.Time `json:"handledAt"`
}

const feedbackColumns = `f.id,u.username,f.content,f.page_path,f.status,(SELECT count(*) FROM feedback_images i WHERE i.feedback_id=f.id),f.created_at,f.handled_at`
const feedbackFrom = ` FROM feedback f JOIN users u ON u.id=f.user_id `

func scanFeedback(row inspirationScanner) (userFeedback, error) {
	var item userFeedback
	err := row.Scan(&item.ID, &item.Username, &item.Content, &item.PagePath, &item.Status, &item.ImageCount, &item.CreatedAt, &item.HandledAt)
	return item, err
}
func (s *Service) feedbackFailure(w http.ResponseWriter) {
	s.error(w, 503, "FEEDBACK_UNAVAILABLE", "反馈暂时无法处理，请稍后重试")
}

func (s *Service) adminFeedback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.requireAdmin(w, r) {
		return
	}
	if s.db == nil {
		s.feedbackFailure(w)
		return
	}
	where := " WHERE true"
	args := []any{}
	status := r.URL.Query().Get("status")
	if status != "" && status != "all" {
		if status != "pending" && status != "handled" {
			s.error(w, 400, "FEEDBACK_STATUS_INVALID", "反馈状态无效")
			return
		}
		args = append(args, status)
		where += " AND f.status=$1"
	}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		where += fmt.Sprintf(" AND (f.content ILIKE $%d OR u.username ILIKE $%d OR f.id ILIKE $%d)", len(args), len(args), len(args))
	}
	tx, pagination, err := s.beginAdminPage(r, "SELECT count(*)"+feedbackFrom+where, args...)
	if err != nil {
		s.feedbackFailure(w)
		return
	}
	defer tx.Rollback()
	size, page := pagination.PageSize, pagination.Page
	query := "SELECT " + feedbackColumns + feedbackFrom + where + fmt.Sprintf(" ORDER BY f.created_at DESC,f.id DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	rows, err := tx.QueryContext(r.Context(), query, append(args, size, (page-1)*size)...)
	if err != nil {
		s.feedbackFailure(w)
		return
	}
	defer rows.Close()
	items := []userFeedback{}
	for rows.Next() {
		item, err := scanFeedback(rows)
		if err != nil {
			s.feedbackFailure(w)
			return
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		s.feedbackFailure(w)
		return
	}
	s.json(w, 200, pagination.response("feedback", items))
}

func (s *Service) adminFeedbackByID(w http.ResponseWriter, r *http.Request, id string) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.requireAdmin(w, r) {
		return
	}
	if s.db == nil {
		s.feedbackFailure(w)
		return
	}
	if r.Method == http.MethodPatch {
		var input struct {
			Status string `json:"status"`
		}
		if !decode(r, &input) || (input.Status != "pending" && input.Status != "handled") {
			s.error(w, 400, "FEEDBACK_STATUS_INVALID", "反馈状态无效")
			return
		}
		actor, _ := s.currentAdministrator(r)
		result, err := s.db.ExecContext(r.Context(), `UPDATE feedback SET status=$2,handled_by=CASE WHEN $2='handled' THEN $3 ELSE '' END,handled_at=CASE WHEN $2='handled' THEN COALESCE(handled_at,now()) ELSE NULL END WHERE id=$1 AND status<>$2`, id, input.Status, actor.ID)
		if err != nil {
			s.feedbackFailure(w)
			return
		}
		if count, err := result.RowsAffected(); err == nil && count > 0 {
			s.audit(actor.ID, "feedback.status", id, input.Status)
		}
	}
	item, err := scanFeedback(s.db.QueryRowContext(r.Context(), "SELECT "+feedbackColumns+feedbackFrom+" WHERE f.id=$1", id))
	if errors.Is(err, sql.ErrNoRows) {
		s.error(w, 404, "FEEDBACK_NOT_FOUND", "反馈不存在")
		return
	}
	if err != nil {
		s.feedbackFailure(w)
		return
	}
	images := []map[string]any{}
	for i := 1; i <= item.ImageCount; i++ {
		images = append(images, map[string]any{"path": "/v1/admin/feedback/" + id + "/images/" + strconv.Itoa(i), "position": i})
	}
	s.json(w, 200, map[string]any{"feedback": item, "images": images})
}

func (s *Service) feedbackImage(w http.ResponseWriter, r *http.Request, id, position string, admin bool) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	uid := ""
	if admin {
		if !s.requireAdmin(w, r) {
			return
		}
	} else {
		var ok bool
		uid, ok = s.requireLibraryUser(w, r)
		if !ok {
			return
		}
	}
	if s.db == nil {
		s.feedbackFailure(w)
		return
	}
	n, err := strconv.Atoi(position)
	if err != nil || n < 1 || n > 3 {
		s.error(w, 404, "FEEDBACK_IMAGE_NOT_FOUND", "反馈图片不存在")
		return
	}
	query := `SELECT i.storage_key,i.mime FROM feedback_images i JOIN feedback f ON f.id=i.feedback_id WHERE f.id=$1 AND i.position=$2`
	args := []any{id, n}
	if !admin {
		query += " AND f.user_id=$3"
		args = append(args, uid)
	}
	var key, mime string
	err = s.db.QueryRowContext(r.Context(), query, args...).Scan(&key, &mime)
	if errors.Is(err, sql.ErrNoRows) {
		s.error(w, 404, "FEEDBACK_IMAGE_NOT_FOUND", "反馈图片不存在")
		return
	}
	if err != nil {
		s.feedbackFailure(w)
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		s.error(w, 404, "FEEDBACK_IMAGE_NOT_FOUND", "反馈图片无法读取")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", mime)
	_, _ = io.Copy(w, file)
}
