package studio

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/istudio/server/internal/idgen"
)

func loadModelChannels(tx *sql.Tx, id string) ([]modelChannel, error) {
	rows, err := tx.Query("SELECT id,endpoint_id,upstream_model_id,enabled,is_active FROM public_model_channels WHERE public_model_id=$1 ORDER BY created_at,id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	channels := []modelChannel{}
	for rows.Next() {
		var c modelChannel
		if err = rows.Scan(&c.ID, &c.EndpointID, &c.UpstreamModelID, &c.Enabled, &c.IsActive); err != nil {
			return nil, err
		}
		channels = append(channels, c)
	}
	return channels, rows.Err()
}
func (s *Service) adminModels(w http.ResponseWriter, r *http.Request, suffix string) {
	if !s.requireAdmin(w, r) {
		return
	}
	id := strings.TrimPrefix(suffix, "/")
	if r.Method == "GET" && id == "" {
		tx, page, err := s.beginAdminPage(r, "SELECT count(*) FROM public_models")
		if err != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		defer tx.Rollback()
		order := adminSortOrder(r, map[string]string{"name": "name", "priceMinor": "price_minor", "enabled": "enabled"}, "is_default DESC,created_at")
		rows, err := tx.QueryContext(r.Context(), "SELECT "+publicModelColumns+" FROM public_models ORDER BY "+order+",id LIMIT $1 OFFSET $2", page.PageSize, page.offset())
		if err != nil {
			s.error(w, 500, "MODELS_UNAVAILABLE", "模型读取失败")
			return
		}
		models := []publicModel{}
		for rows.Next() {
			m, e := scanPublicModel(rows)
			if e != nil {
				err = e
				break
			}
			models = append(models, m)
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		for i := range models {
			if err != nil {
				break
			}
			models[i].Channels, err = loadModelChannels(tx, models[i].ID)
		}
		if err == nil {
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
	m.UsageHint = strings.TrimSpace(m.UsageHint)
	if utf8.RuneCountInString(m.Name) < 1 || utf8.RuneCountInString(m.Name) > 80 || m.PriceMinor < 0 || m.PriceMinor > 100000000 || (m.IsDefault && !m.Enabled) {
		s.error(w, 400, "MODEL_INVALID", "请检查名称、单价和上架状态")
		return
	}
	if m.Capabilities.AspectRatios == nil {
		m.Capabilities = defaultModelCapabilities()
	}
	if err := validateModelConfiguration(m); err != nil {
		s.error(w, 400, "MODEL_INVALID", err.Error())
		return
	}
	if id == "" {
		id = "model_" + idgen.New()
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.error(w, 500, "MODEL_STORAGE_ERROR", "保存失败")
		return
	}
	defer tx.Rollback()
	if _, err = tx.Exec("SELECT pg_advisory_xact_lock(79140001)"); err != nil {
		s.error(w, 500, "MODEL_STORAGE_ERROR", "保存失败")
		return
	}
	if r.Method == "PUT" {
		var version int64
		err = tx.QueryRow("SELECT version FROM public_models WHERE id=$1", id).Scan(&version)
		if err == sql.ErrNoRows {
			s.error(w, 404, "MODEL_NOT_FOUND", "模型不存在")
			return
		}
		if err != nil {
			s.error(w, 500, "MODEL_STORAGE_ERROR", "读取失败")
			return
		}
		if version != m.Version {
			s.error(w, 409, "MODEL_CONFLICT", "模型已被修改，请刷新后重试")
			return
		}
	}
	for _, c := range m.Channels {
		var purpose string
		var enabled bool
		if err = tx.QueryRow("SELECT purpose,enabled FROM ai_endpoints WHERE id=$1", c.EndpointID).Scan(&purpose, &enabled); err != nil || purpose != "image" || (c.IsActive && !enabled) {
			s.error(w, 400, "MODEL_ENDPOINT_INVALID", "主渠道必须使用已启用的生图服务")
			return
		}
	}
	if m.IsDefault {
		_, err = tx.Exec("UPDATE public_models SET is_default=false,version=version+1 WHERE is_default AND id<>$1", id)
	}
	caps, _ := json.Marshal(m.Capabilities)
	if err == nil {
		if r.Method == "POST" {
			_, err = tx.Exec("INSERT INTO public_models(id,name,price_minor,enabled,is_default,capabilities,usage_hint) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)", id, m.Name, m.PriceMinor, m.Enabled, m.IsDefault, caps, m.UsageHint)
		} else {
			_, err = tx.Exec("UPDATE public_models SET name=$2,price_minor=$3,enabled=$4,is_default=$5,capabilities=$6::jsonb,usage_hint=$7,version=version+1 WHERE id=$1", id, m.Name, m.PriceMinor, m.Enabled, m.IsDefault, caps, m.UsageHint)
		}
	}
	// Replace the aggregate in one transaction. Channel IDs remain stable per endpoint.
	previous, loadErr := loadModelChannels(tx, id)
	if err == nil {
		err = loadErr
	}
	ids := map[string]string{}
	for _, c := range previous {
		ids[c.EndpointID] = c.ID
	}
	if err == nil {
		_, err = tx.Exec("UPDATE public_model_channels SET is_active=false WHERE public_model_id=$1", id)
	}
	keep := []string{}
	for _, c := range m.Channels {
		if err != nil {
			break
		}
		bindingID := ids[c.EndpointID]
		if bindingID == "" {
			bindingID = "channel_" + idgen.New()
		}
		keep = append(keep, bindingID)
		_, err = tx.Exec(`INSERT INTO public_model_channels(id,public_model_id,endpoint_id,upstream_model_id,enabled,is_active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET upstream_model_id=EXCLUDED.upstream_model_id,enabled=EXCLUDED.enabled,is_active=EXCLUDED.is_active,updated_at=now()`, bindingID, id, c.EndpointID, strings.TrimSpace(c.UpstreamModelID), c.Enabled, c.IsActive)
	}
	if err == nil {
		_, err = tx.Exec("DELETE FROM public_model_channels WHERE public_model_id=$1 AND NOT(id=ANY($2::text[]))", id, keep)
	}
	u, _ := s.currentAdministrator(r)
	if err == nil {
		_, err = tx.Exec("INSERT INTO admin_audit(actor_id,action,target_id,detail) VALUES($1,'model.save',$2,$3)", u.ID, id, fmt.Sprintf("%s; 单价=%d; 上架=%t", m.Name, m.PriceMinor, m.Enabled))
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.error(w, 409, "MODEL_STORAGE_ERROR", "保存失败，请检查渠道或刷新后重试")
		return
	}
	s.json(w, 200, map[string]string{"id": id})
}
func validateModelConfiguration(m publicModel) error {
	if utf8.RuneCountInString(m.UsageHint) > 200 {
		return fmt.Errorf("使用建议最多 200 个字符")
	}
	seen := map[string]bool{}
	active := 0
	for _, c := range m.Channels {
		if c.EndpointID == "" || seen[c.EndpointID] {
			return fmt.Errorf("同一模型不能重复绑定相同渠道")
		}
		seen[c.EndpointID] = true
		if n := len(strings.TrimSpace(c.UpstreamModelID)); n < 1 || n > 200 {
			return fmt.Errorf("上游模型 ID 需为 1–200 个字符")
		}
		if c.IsActive {
			active++
			if !c.Enabled {
				return fmt.Errorf("主绑定必须启用")
			}
		}
	}
	if active > 1 || (m.Enabled && active != 1) {
		return fmt.Errorf("已上架模型必须且只能有一个启用的主渠道；移除主渠道前请下架模型")
	}
	if len(m.Capabilities.AspectRatios) == 0 || len(m.Capabilities.Resolutions) == 0 {
		return fmt.Errorf("至少选择一个比例和分辨率")
	}
	for _, v := range m.Capabilities.AspectRatios {
		if _, ok := allowedRatios[v]; !ok {
			return fmt.Errorf("不支持的比例 %s", v)
		}
	}
	for _, v := range m.Capabilities.Resolutions {
		if _, ok := allowedResolutions[v]; !ok {
			return fmt.Errorf("不支持的分辨率 %s", v)
		}
	}
	return nil
}
