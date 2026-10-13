package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
)

const registerInspirationCategories = `INSERT INTO inspiration_categories(id,name)
SELECT 'category_' || md5(category), category FROM inspiration_prompts WHERE category<>'' GROUP BY category
ON CONFLICT(name) DO NOTHING`

type inspirationCategoryRow struct {
	ID           string `json:"id"`
	Category     string `json:"category"`
	Count        int    `json:"count"`
	EnabledCount int    `json:"enabledCount"`
}

// Category moves, renames and prompt saves share a lock, including across API instances.
func beginInspirationEdit(db *sql.DB) (*sql.Tx, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(724091025)"); err == nil {
		_, err = tx.Exec(registerInspirationCategories)
	}
	if err != nil {
		tx.Rollback()
		return nil, err
	}
	return tx, nil
}

func ensureInspirationCategory(tx *sql.Tx, name string) error {
	_, err := tx.Exec("INSERT INTO inspiration_categories(id,name) VALUES($1,$2) ON CONFLICT(name) DO NOTHING", "category_"+randomID(), name)
	return err
}

func categoryCount(tx *sql.Tx, id string) (inspirationCategoryRow, error) {
	var row inspirationCategoryRow
	err := tx.QueryRow(`SELECT c.id,c.name,count(p.id),count(p.id) FILTER(WHERE p.enabled)
FROM inspiration_categories c LEFT JOIN inspiration_prompts p ON p.category=c.name WHERE c.id=$1 GROUP BY c.id,c.name`, id).Scan(&row.ID, &row.Category, &row.Count, &row.EnabledCount)
	return row, err
}

func (s *server) listInspirationCategories(w http.ResponseWriter, r *http.Request) {
	includeDisabled := r.URL.Query().Get("includeDisabled") == "true"
	if includeDisabled && !s.requireSettingsUser(w, r) {
		return
	}
	if s.db == nil {
		if includeDisabled {
			s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "分类管理需要连接 PostgreSQL 数据库")
		} else {
			s.json(w, 200, map[string]any{"categories": []any{}})
		}
		return
	}
	tx, err := beginInspirationEdit(s.db)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类查询失败")
		return
	}
	defer tx.Rollback()
	count := "count(p.id)"
	having := ""
	if !includeDisabled {
		count = "count(p.id) FILTER(WHERE p.enabled)"
		having = " HAVING count(p.id) FILTER(WHERE p.enabled)>0"
	}
	rows, err := tx.Query(`SELECT c.id,c.name,` + count + `,count(p.id) FILTER(WHERE p.enabled)
FROM inspiration_categories c LEFT JOIN inspiration_prompts p ON p.category=c.name GROUP BY c.id,c.name` + having + ` ORDER BY min(p.sort_order) ASC NULLS LAST,c.name ASC`)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类查询失败")
		return
	}
	list := []inspirationCategoryRow{}
	for rows.Next() {
		var row inspirationCategoryRow
		if err = rows.Scan(&row.ID, &row.Category, &row.Count, &row.EnabledCount); err != nil {
			break
		}
		list = append(list, row)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类查询失败")
		return
	}
	s.json(w, 200, map[string]any{"categories": list})
}

func (s *server) editInspirationCategory(w http.ResponseWriter, r *http.Request, id string) {
	if !s.requireSettingsUser(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "分类管理需要连接 PostgreSQL 数据库")
		return
	}
	var input struct {
		Name     string `json:"name"`
		MoveToID string `json:"moveToId"`
	}
	if (r.Method != http.MethodDelete || r.ContentLength != 0) && !decode(r, &input) {
		s.error(w, 400, "INSPIRATION_CATEGORY_INVALID", "分类参数格式不正确")
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if r.Method != http.MethodDelete && (input.Name == "" || len([]rune(input.Name)) > 80) {
		s.error(w, 400, "INSPIRATION_CATEGORY_INVALID", "分类名称需为 1–80 个字符")
		return
	}
	tx, err := beginInspirationEdit(s.db)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类保存失败")
		return
	}
	defer tx.Rollback()
	current := inspirationCategoryRow{}
	if id != "" {
		current, err = categoryCount(tx, id)
		if errors.Is(err, sql.ErrNoRows) {
			s.error(w, 404, "INSPIRATION_CATEGORY_NOT_FOUND", "分类不存在或已被删除")
			return
		}
		if err != nil {
			s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类读取失败")
			return
		}
	}
	if r.Method == http.MethodDelete {
		moved := int64(0)
		if current.Count > 0 {
			if input.MoveToID == "" || input.MoveToID == id {
				s.error(w, 409, "INSPIRATION_CATEGORY_IN_USE", "此分类有提示词，请选择其他分类接收后再删除")
				return
			}
			target, targetErr := categoryCount(tx, input.MoveToID)
			if targetErr != nil {
				if errors.Is(targetErr, sql.ErrNoRows) {
					s.error(w, 400, "INSPIRATION_CATEGORY_TARGET_INVALID", "接收分类不存在，请重新选择")
				} else {
					s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "接收分类读取失败")
				}
				return
			}
			result, updateErr := tx.Exec("UPDATE inspiration_prompts SET category=$1 WHERE category=$2", target.Category, current.Category)
			if updateErr != nil {
				s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "提示词迁移失败")
				return
			}
			moved, _ = result.RowsAffected()
		}
		if _, err = tx.Exec("DELETE FROM inspiration_categories WHERE id=$1", id); err == nil {
			err = tx.Commit()
		}
		if err != nil {
			s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类删除失败")
			return
		}
		s.json(w, 200, map[string]any{"success": true, "movedCount": moved})
		return
	}
	if id == "" {
		id = "category_" + randomID()
		err = tx.QueryRow("INSERT INTO inspiration_categories(id,name) VALUES($1,$2) ON CONFLICT(name) DO NOTHING RETURNING id", id, input.Name).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			s.error(w, 409, "INSPIRATION_CATEGORY_EXISTS", "此分类已存在")
			return
		}
	} else if current.Category != input.Name {
		var exists bool
		if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM inspiration_categories WHERE name=$1 AND id<>$2)", input.Name, id).Scan(&exists); err != nil {
			s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类查询失败")
			return
		}
		if exists {
			s.error(w, 409, "INSPIRATION_CATEGORY_EXISTS", "此分类已存在")
			return
		}
		if _, err = tx.Exec("UPDATE inspiration_prompts SET category=$1 WHERE category=$2", input.Name, current.Category); err == nil {
			_, err = tx.Exec("UPDATE inspiration_categories SET name=$1 WHERE id=$2", input.Name, id)
		}
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类保存失败")
		return
	}
	row, err := categoryCount(tx, id)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类保存失败")
		return
	}
	status := http.StatusOK
	if r.Method == http.MethodPost {
		status = http.StatusCreated
	}
	s.json(w, status, map[string]any{"category": row})
}

func (s *server) inspirationCategoryByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	id := strings.TrimPrefix(r.URL.Path, "/v1/inspiration/categories/")
	if id == "" || strings.Contains(id, "/") {
		s.error(w, 404, "INSPIRATION_CATEGORY_NOT_FOUND", "分类不存在")
		return
	}
	if r.Method != http.MethodPut && r.Method != http.MethodDelete {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	s.editInspirationCategory(w, r, id)
}
