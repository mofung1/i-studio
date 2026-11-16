package studio

import (
	"database/sql"
	"errors"
	"net/http"
	"time"
)

type commerceProductVersion struct {
	AssetID        string    `json:"assetId"`
	TaskID         string    `json:"taskId"`
	Purpose        string    `json:"purpose"`
	ParentAssetID  string    `json:"parentAssetId"`
	ProductVersion int       `json:"productVersion"`
	ContentPath    string    `json:"contentPath"`
	ThumbnailPath  string    `json:"thumbnailPath"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	SizeBytes      int64     `json:"sizeBytes"`
	Adopted        bool      `json:"adopted"`
	CreatedAt      time.Time `json:"createdAt"`
}

// A version is a delivered asset from a product task, not an arbitrary uploaded
// asset ID supplied by the browser. Partial deliveries remain usable after a
// failed task, but unfinished tasks are not exposed as completed candidates.
const commerceVersionFrom = ` FROM assets a JOIN generation_tasks t ON t.id=a.task_id AND t.user_id=a.user_id`
const commerceVersionConditions = `a.hidden_at IS NULL AND t.status NOT IN ('queued','processing','waiting_provider') AND t.result_images ? ('/v1/assets/'||a.id||'/content') AND t.input->>'productPurpose' IN ('main','scene','detail','selling-point')`

func (s *Service) commerceProductVersions(w http.ResponseWriter, r *http.Request, uid, id string) {
	var found string
	err := s.db.QueryRow("SELECT id FROM commerce_products WHERE id=$1 AND user_id=$2", id, uid).Scan(&found)
	if err == sql.ErrNoRows {
		s.error(w, 404, "PRODUCT_NOT_FOUND", "商品档案不存在或无权访问")
		return
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	q := libraryQuery{}
	q.add("a.user_id=$%d", uid)
	q.add("t.input->>'productId'=$%d", id)
	q.conditions = append(q.conditions, commerceVersionConditions)
	if purpose := r.URL.Query().Get("purpose"); purpose != "" {
		if _, valid := commerceProductPurposes[purpose]; !valid {
			s.error(w, 400, "PRODUCT_PURPOSE_INVALID", "请选择主图、场景图、细节图或卖点图")
			return
		}
		q.add("t.input->>'productPurpose'=$%d", purpose)
	}
	var total int
	if err = s.db.QueryRow("SELECT count(*)"+commerceVersionFrom+q.where(), q.args...).Scan(&total); err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	order, err := q.page(r, "a.created_at", "a.id")
	if err != nil {
		s.error(w, 400, "CURSOR_INVALID", "分页已失效，请刷新")
		return
	}
	rows, err := s.db.Query(`SELECT a.id,t.id,t.input->>'productPurpose',COALESCE(t.input->>'parentAssetId',''),COALESCE((t.input->>'productVersion')::integer,1),a.width,a.height,a.size_bytes,a.created_at,
 EXISTS(SELECT 1 FROM commerce_product_adoptions d WHERE d.product_id=t.input->>'productId' AND d.purpose=t.input->>'productPurpose' AND d.asset_id=a.id)`+commerceVersionFrom+q.where()+order, q.args...)
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	versions := []commerceProductVersion{}
	for rows.Next() {
		var v commerceProductVersion
		if err = rows.Scan(&v.AssetID, &v.TaskID, &v.Purpose, &v.ParentAssetID, &v.ProductVersion, &v.Width, &v.Height, &v.SizeBytes, &v.CreatedAt, &v.Adopted); err != nil {
			break
		}
		v.ContentPath = "/v1/assets/" + v.AssetID + "/content"
		v.ThumbnailPath = "/v1/assets/" + v.AssetID + "/thumbnail"
		versions = append(versions, v)
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		s.commerceProductFailure(w, errors.Join(err, rowErr))
		return
	}
	limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)
	next := ""
	if len(versions) > limit {
		versions = versions[:limit]
		last := versions[limit-1]
		next = encodePageCursor(last.CreatedAt, last.AssetID, r.URL.Query().Get("sort") == "oldest")
	}
	s.json(w, 200, map[string]any{"versions": versions, "total": total, "nextCursor": next})
}

func (s *Service) adoptCommerceProductVersion(w http.ResponseWriter, r *http.Request, uid, id string) {
	var input struct {
		AssetID string `json:"assetId"`
	}
	if !decode(r, &input) || input.AssetID == "" || len(input.AssetID) > 200 {
		s.error(w, 400, "PRODUCT_VERSION_INVALID", "请选择需要采用的图片")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	defer tx.Rollback()
	var found string
	if err = tx.QueryRow("SELECT id FROM commerce_products WHERE id=$1 AND user_id=$2 FOR UPDATE", id, uid).Scan(&found); err == sql.ErrNoRows {
		s.error(w, 404, "PRODUCT_NOT_FOUND", "商品档案不存在或无权访问")
		return
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	var purpose string
	err = tx.QueryRow("SELECT t.input->>'productPurpose'"+commerceVersionFrom+" WHERE a.id=$1 AND a.user_id=$2 AND t.input->>'productId'=$3 AND "+commerceVersionConditions+" FOR KEY SHARE OF a,t", input.AssetID, uid, id).Scan(&purpose)
	if err == sql.ErrNoRows {
		s.error(w, 404, "PRODUCT_VERSION_NOT_FOUND", "图片不是该商品已完成的候选版本，或已移除")
		return
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	_, err = tx.Exec(`INSERT INTO commerce_product_adoptions(product_id,purpose,asset_id) VALUES($1,$2,$3) ON CONFLICT(product_id,purpose) DO UPDATE SET asset_id=excluded.asset_id,updated_at=now()`, id, purpose, input.AssetID)
	if err == nil {
		// Adopting a result does not change the source product brief or invalidate
		// other editors' version checks.
		_, err = tx.Exec("UPDATE commerce_products SET updated_at=now() WHERE id=$1", id)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	s.respondCommerceProduct(w, uid, id, 200)
}
