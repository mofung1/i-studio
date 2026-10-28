package studio

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

type inspirationCategoryRow struct {
	SortOrder    int    `json:"sortOrder"`
	ID           string `json:"id"`
	Category     string `json:"category"`
	Count        int    `json:"count"`
	EnabledCount int    `json:"enabledCount"`
}

func categoryCount(tx *sql.Tx, id string) (inspirationCategoryRow, error) {
	var row inspirationCategoryRow
	err := tx.QueryRow(`SELECT c.id,c.name,c.sort_order,count(p.id),count(p.id) FILTER(WHERE p.enabled)
FROM inspiration_categories c LEFT JOIN inspiration_prompts p ON p.category=c.name WHERE c.id=$1 GROUP BY c.id,c.name`, id).Scan(&row.ID, &row.Category, &row.SortOrder, &row.Count, &row.EnabledCount)
	return row, err
}

func (s *Service) listInspirationCategories(w http.ResponseWriter, r *http.Request) {
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
	tx, err := repository.BeginInspirationEdit(s.db)
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
	rows, err := tx.Query(`SELECT c.id,c.name,c.sort_order,` + count + `,count(p.id) FILTER(WHERE p.enabled)
FROM inspiration_categories c LEFT JOIN inspiration_prompts p ON p.category=c.name GROUP BY c.id,c.name` + having + ` ORDER BY c.sort_order ASC,c.name ASC,c.id ASC`)
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "分类查询失败")
		return
	}
	list := []inspirationCategoryRow{}
	for rows.Next() {
		var row inspirationCategoryRow
		if err = rows.Scan(&row.ID, &row.Category, &row.SortOrder, &row.Count, &row.EnabledCount); err != nil {
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

func (s *Service) editInspirationCategory(w http.ResponseWriter, r *http.Request, id string) {
	if !s.requireSettingsUser(w, r) {
		return
	}
	if s.db == nil {
		s.error(w, 503, "INSPIRATION_DATABASE_REQUIRED", "分类管理需要连接 PostgreSQL 数据库")
		return
	}
	var input struct {
		Name      string `json:"name"`
		SortOrder *int   `json:"sortOrder"`
		MoveToID  string `json:"moveToId"`
	}
	if (r.Method != http.MethodDelete || r.ContentLength != 0) && !decode(r, &input) {
		s.error(w, 400, "INSPIRATION_CATEGORY_INVALID", "分类参数格式不正确")
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if r.Method != http.MethodDelete && ((input.Name == "" && (id == "" || input.SortOrder == nil)) || len([]rune(input.Name)) > 80) {
		s.error(w, 400, "INSPIRATION_CATEGORY_INVALID", "分类名称需为 1–80 个字符")
		return
	}
	if input.SortOrder != nil && (*input.SortOrder < -1000000 || *input.SortOrder > 1000000) {
		s.error(w, 400, "INSPIRATION_CATEGORY_INVALID", "排序值需在 -1000000 至 1000000 之间")
		return
	}
	tx, err := repository.BeginInspirationEdit(s.db)
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
	if input.Name == "" {
		input.Name = current.Category
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
		id = "category_" + idgen.New()
		err = tx.QueryRow("INSERT INTO inspiration_categories(id,name,sort_order) SELECT $1,$2,LEAST(COALESCE(max(sort_order),-10)+10,1000000) FROM inspiration_categories ON CONFLICT(name) DO NOTHING RETURNING id", id, input.Name).Scan(&id)
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
	if input.SortOrder != nil && err == nil {
		_, err = tx.Exec("UPDATE inspiration_categories SET sort_order=$1 WHERE id=$2", *input.SortOrder, id)
	}
	if err != nil {
		s.error(w, 500, "INSPIRATION_STORAGE_ERROR", "排序保存失败")
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

func (s *Service) inspirationCategoryByID(w http.ResponseWriter, r *http.Request) {
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
