package studio

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/istudio/server/internal/idgen"
)

func (s *Service) adminModels(w http.ResponseWriter, r *http.Request, suffix string) {
	id := strings.TrimPrefix(suffix, "/")
	if r.Method == "GET" && id == "" {
		tx, page, err := s.beginAdminPage(r, "SELECT count(*) FROM public_models")
		if err != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		defer tx.Rollback()
		order := adminSortOrder(r, map[string]string{"name": "name", "priceMinor": "price_minor", "enabled": "enabled"}, "is_default DESC,created_at")
		rows, err := tx.QueryContext(r.Context(), "SELECT id,name,endpoint_id,price_minor,enabled,is_default,version FROM public_models ORDER BY "+order+",id LIMIT $1 OFFSET $2", page.PageSize, page.offset())
		if err != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		defer rows.Close()
		models := []publicModel{}
		for rows.Next() {
			var model publicModel
			if err = rows.Scan(&model.ID, &model.Name, &model.EndpointID, &model.PriceMinor, &model.Enabled, &model.IsDefault, &model.Version); err != nil {
				break
			}
			models = append(models, model)
		}
		if err != nil || rows.Err() != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		if err = rows.Close(); err == nil {
			err = tx.Commit()
		}
		if err != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		s.json(w, 200, page.response("models", models))
		return
	}
	if r.Method != "POST" && r.Method != "PUT" {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "模型请使用上架、下架管理")
		return
	}
	if (r.Method == "POST" && id != "") || (r.Method == "PUT" && id == "") {
		s.error(w, 404, "NOT_FOUND", "模型不存在")
		return
	}
	var m publicModel
	if !decode(r, &m) {
		s.error(w, 400, "MODEL_INVALID", "模型格式错误")
		return
	}
	m.Name = strings.TrimSpace(m.Name)
	if utf8.RuneCountInString(m.Name) < 1 || utf8.RuneCountInString(m.Name) > 80 || m.PriceMinor < 0 || m.PriceMinor > 100000000 || (m.IsDefault && !m.Enabled) {
		s.error(w, 400, "MODEL_INVALID", "请检查名称、单价和上架状态")
		return
	}
	endpoints, err := s.ai.list()
	exists := false
	for _, e := range endpoints {
		if e.ID == m.EndpointID && e.Purpose == "image" && (!m.Enabled || e.Enabled) {
			exists = true
		}
	}
	if err != nil || !exists {
		s.error(w, 400, "MODEL_ENDPOINT_INVALID", "请选择可用的生图服务通道")
		return
	}
	if id == "" {
		id = "model_" + idgen.New()
	}
	u, _ := s.currentAdministrator(r)
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "MODEL_STORAGE_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	// Serialize default changes and catalog mutations against task reservation.
	_, err = tx.Exec("SELECT pg_advisory_xact_lock(79140001)")
	if err == nil && m.IsDefault {
		_, err = tx.Exec("UPDATE public_models SET is_default=false WHERE is_default")
	}
	var result sql.Result
	if err == nil {
		if r.Method == "POST" {
			result, err = tx.Exec("INSERT INTO public_models(id,name,endpoint_id,price_minor,enabled,is_default) VALUES($1,$2,$3,$4,$5,$6)", id, m.Name, m.EndpointID, m.PriceMinor, m.Enabled, m.IsDefault)
		} else {
			result, err = tx.Exec("UPDATE public_models SET name=$2,endpoint_id=$3,price_minor=$4,enabled=$5,is_default=$6,version=version+1 WHERE id=$1", id, m.Name, m.EndpointID, m.PriceMinor, m.Enabled, m.IsDefault)
		}
	}
	if err == nil {
		n, _ := result.RowsAffected()
		if n == 0 {
			s.error(w, 404, "MODEL_NOT_FOUND", "模型不存在")
			return
		}
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'model.save',$2,$3)", u.ID, id, fmt.Sprintf("%s; 单价=%d; 上架=%t", m.Name, m.PriceMinor, m.Enabled))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 500, "MODEL_STORAGE_ERROR", "保存失败")
		return
	}
	s.json(w, 200, map[string]string{"id": id})
}
