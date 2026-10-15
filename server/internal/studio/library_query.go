package studio

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type pageCursor struct {
	Date   time.Time `json:"date"`
	ID     string    `json:"id"`
	Oldest bool      `json:"oldest"`
}

func encodePageCursor(date time.Time, id string, oldest bool) string {
	raw, _ := json.Marshal(pageCursor{date, id, oldest})
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodePageCursor(value string, oldest bool) (pageCursor, error) {
	var cursor pageCursor
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || len(raw) > 512 {
		return cursor, errors.New("invalid cursor")
	}
	if err = json.Unmarshal(raw, &cursor); err != nil || cursor.Date.IsZero() || cursor.ID == "" || len(cursor.ID) > 100 || cursor.Oldest != oldest {
		return cursor, errors.New("invalid cursor")
	}
	return cursor, nil
}

type libraryQuery struct {
	conditions []string
	args       []any
}

func (q *libraryQuery) add(condition string, value any) {
	q.args = append(q.args, value)
	q.conditions = append(q.conditions, fmt.Sprintf(condition, len(q.args)))
}

func (q *libraryQuery) where() string { return " WHERE " + strings.Join(q.conditions, " AND ") }

func (q *libraryQuery) dates(r *http.Request, column string) error {
	for _, item := range []struct {
		key, operator string
		end           bool
	}{{"from", ">=", false}, {"to", "<", true}} {
		if value := r.URL.Query().Get(item.key); value != "" {
			date, err := time.ParseInLocation("2006-01-02", value, generationStorageLocation)
			if err != nil {
				return err
			}
			if item.end {
				date = date.AddDate(0, 0, 1)
			}
			q.add(column+" "+item.operator+" $%d", date)
		}
	}
	return nil
}

func (q *libraryQuery) page(r *http.Request, column, idColumn string) (string, error) {
	oldest := r.URL.Query().Get("sort") == "oldest"
	direction, operator := "DESC", "<"
	if oldest {
		direction, operator = "ASC", ">"
	}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		cursor, err := decodePageCursor(raw, oldest)
		if err != nil {
			return "", err
		}
		q.args = append(q.args, cursor.Date, cursor.ID)
		q.conditions = append(q.conditions, fmt.Sprintf("(%s,%s) %s ($%d,$%d)", column, idColumn, operator, len(q.args)-1, len(q.args)))
	}
	q.args = append(q.args, clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)+1)
	return fmt.Sprintf(" ORDER BY %s %s,%s %s LIMIT $%d", column, direction, idColumn, direction, len(q.args)), nil
}

func escapeLike(value string) string {
	return strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(value)
}
