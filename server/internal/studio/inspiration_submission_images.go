package studio

import (
	"io"
	"net/http"
	"strings"
)

func (s *Service) serveSubmissionCover(w http.ResponseWriter, r *http.Request, id, uid string, admin bool) {
	w.Header().Set("Cache-Control", "no-store")
	version := parseQueryInt(r.URL.Query().Get("version"), 0)
	query := `SELECT r.cover_key FROM inspiration_submission_revisions r JOIN inspiration_submissions s ON s.id=r.submission_id WHERE s.id=$1 AND r.version=$2`
	args := []any{id, version}
	if !admin {
		query += " AND s.user_id=$3"
		args = append(args, uid)
	}
	var key string
	if s.db.QueryRowContext(r.Context(), query, args...).Scan(&key) != nil {
		s.error(w, 404, "SUBMISSION_NOT_FOUND", "投稿封面不存在")
		return
	}
	file, err := s.storage.Open(key)
	if err != nil {
		s.error(w, 404, "SUBMISSION_NOT_FOUND", "投稿封面不存在")
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", "image/jpeg")
	_, _ = io.Copy(w, file)
}

func communityInspirationKey(key string) bool {
	object := key
	if strings.HasPrefix(object, "@storage/") {
		_, object, _ = strings.Cut(strings.TrimPrefix(object, "@storage/"), "/")
	}
	object = strings.TrimPrefix(object, "inspiration/")
	return strings.HasPrefix(object, "community/")
}
