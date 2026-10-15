package studio

import (
	"database/sql"
	"net/http"
)

type adminPagination struct {
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	Total      int `json:"total"`
	TotalPages int `json:"totalPages"`
}

// Count and rows share a snapshot so concurrent writes cannot split a page.
func (s *Service) beginAdminPage(r *http.Request, countQuery string, args ...any) (*sql.Tx, adminPagination, error) {
	page := adminPagination{
		Page:     max(1, parseQueryInt(r.URL.Query().Get("page"), 1)),
		PageSize: clampInt(parseQueryInt(r.URL.Query().Get("pageSize"), 20), 1, 100),
	}
	tx, err := s.db.BeginTx(r.Context(), &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, page, err
	}
	if err = tx.QueryRowContext(r.Context(), countQuery, args...).Scan(&page.Total); err != nil {
		_ = tx.Rollback()
		return nil, page, err
	}
	page.TotalPages = max(1, (page.Total+page.PageSize-1)/page.PageSize)
	page.Page = min(page.Page, page.TotalPages)
	return tx, page, nil
}

func (p adminPagination) response(key string, items any) map[string]any {
	return map[string]any{key: items, "page": p.Page, "pageSize": p.PageSize, "total": p.Total, "totalPages": p.TotalPages}
}

func (p adminPagination) offset() int { return (p.Page - 1) * p.PageSize }
