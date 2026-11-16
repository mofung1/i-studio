package studio

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/istudio/server/internal/idgen"
	"github.com/istudio/server/internal/repository"
)

var commerceProductPurposes = stringSet("main", "scene", "detail", "selling-point")

type commerceProductInput struct {
	Name              string   `json:"name"`
	Description       string   `json:"description"`
	SellingPoints     string   `json:"sellingPoints"`
	PreserveDetails   string   `json:"preserveDetails"`
	ProductAssetIDs   []string `json:"productAssetIds"`
	ReferenceAssetIDs []string `json:"referenceAssetIds"`
	ProjectID         string   `json:"projectId"`
	Version           int      `json:"version"`
}

type commerceProduct struct {
	commerceProductInput
	ID              string            `json:"id"`
	AdoptedAssetIDs map[string]string `json:"adoptedAssetIds"`
	CreatedAt       time.Time         `json:"createdAt"`
	UpdatedAt       time.Time         `json:"updatedAt"`
}

const commerceProductColumns = `p.id,p.name,p.description,p.selling_points,p.preserve_details,p.product_asset_ids,p.reference_asset_ids,COALESCE(p.project_id,''),p.version,p.created_at,p.updated_at,
 COALESCE((SELECT jsonb_object_agg(d.purpose,d.asset_id) FROM commerce_product_adoptions d JOIN assets a ON a.id=d.asset_id AND a.user_id=p.user_id AND a.hidden_at IS NULL WHERE d.product_id=p.id),'{}'::jsonb)`

func scanCommerceProduct(row inspirationScanner) (commerceProduct, error) {
	var p commerceProduct
	var original, references, adopted []byte
	err := row.Scan(&p.ID, &p.Name, &p.Description, &p.SellingPoints, &p.PreserveDetails, &original, &references, &p.ProjectID, &p.Version, &p.CreatedAt, &p.UpdatedAt, &adopted)
	if err != nil {
		return p, err
	}
	if json.Unmarshal(original, &p.ProductAssetIDs) != nil || json.Unmarshal(references, &p.ReferenceAssetIDs) != nil || json.Unmarshal(adopted, &p.AdoptedAssetIDs) != nil {
		return p, errors.New("invalid stored product data")
	}
	if p.ProductAssetIDs == nil {
		p.ProductAssetIDs = []string{}
	}
	if p.ReferenceAssetIDs == nil {
		p.ReferenceAssetIDs = []string{}
	}
	if p.AdoptedAssetIDs == nil {
		p.AdoptedAssetIDs = map[string]string{}
	}
	return p, nil
}

func normalizeCommerceProduct(input *commerceProductInput, allowEmptyName bool) error {
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.SellingPoints = strings.TrimSpace(input.SellingPoints)
	input.PreserveDetails = strings.TrimSpace(input.PreserveDetails)
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	if (!allowEmptyName && input.Name == "") || len([]rune(input.Name)) > 120 || len([]rune(input.Description)) > 2000 || len([]rune(input.SellingPoints)) > 2000 || len([]rune(input.PreserveDetails)) > 2000 || len(input.ProjectID) > 200 {
		return &operationError{400, "PRODUCT_INPUT_INVALID", "商品名称需为 1–120 字；商品描述、卖点和保留要求分别最多 2000 字"}
	}
	if len(input.ProductAssetIDs) < 1 || len(input.ProductAssetIDs)+len(input.ReferenceAssetIDs) > 6 {
		return &operationError{400, "PRODUCT_INPUT_INVALID", "请至少选择 1 张商品原图；商品原图与风格参考总计最多 6 张"}
	}
	seen := map[string]bool{}
	for _, ids := range [][]string{input.ProductAssetIDs, input.ReferenceAssetIDs} {
		for _, id := range ids {
			if strings.TrimSpace(id) == "" || strings.TrimSpace(id) != id || len(id) > 200 || seen[id] {
				return &operationError{400, "PRODUCT_INPUT_INVALID", "素材编号无效；每张图片只能分配一种参考用途"}
			}
			seen[id] = true
		}
	}
	if input.ReferenceAssetIDs == nil {
		input.ReferenceAssetIDs = []string{}
	}
	return nil
}

func validateCommerceProductAssetsTx(tx *sql.Tx, uid string, input commerceProductInput) error {
	if input.ProjectID != "" {
		var id string
		err := tx.QueryRow("SELECT id FROM projects WHERE id=$1 AND user_id=$2 AND archived=false FOR KEY SHARE", input.ProjectID, uid).Scan(&id)
		if err == sql.ErrNoRows {
			return &operationError{404, "PRODUCT_PROJECT_NOT_FOUND", "项目不存在、已归档或无权访问"}
		}
		if err != nil {
			return err
		}
	}
	for _, ids := range [][]string{input.ProductAssetIDs, input.ReferenceAssetIDs} {
		for _, id := range ids {
			var found string
			err := tx.QueryRow("SELECT id FROM assets WHERE id=$1 AND user_id=$2 AND hidden_at IS NULL AND mime IN ('image/png','image/jpeg','image/webp') FOR KEY SHARE", id, uid).Scan(&found)
			if err == sql.ErrNoRows {
				return &operationError{404, "PRODUCT_ASSET_NOT_FOUND", "参考图片不存在、已移除或无权访问"}
			}
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) commerceProductFailure(w http.ResponseWriter, err error) {
	var operation *operationError
	if errors.As(err, &operation) {
		s.error(w, operation.status, operation.code, operation.message)
		return
	}
	s.error(w, 500, "PRODUCT_STORAGE_ERROR", "商品资料暂时无法保存或读取，请稍后重试")
}

func (s *Service) commerceProducts(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.saveCommerceProduct(w, r, uid, "")
		return
	}
	if r.Method != http.MethodGet {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	q := libraryQuery{}
	q.add("p.user_id=$%d", uid)
	if value := strings.TrimSpace(r.URL.Query().Get("q")); value != "" {
		if len([]rune(value)) > 200 {
			s.error(w, 400, "PRODUCT_INPUT_INVALID", "搜索内容最多 200 字")
			return
		}
		q.add("concat_ws(' ',p.name,p.description,p.selling_points) ILIKE $%d", "%"+escapeLike(value)+"%")
	}
	var total int
	if err := s.db.QueryRow("SELECT count(*) FROM commerce_products p"+q.where(), q.args...).Scan(&total); err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	order, err := q.page(r, "p.updated_at", "p.id")
	if err != nil {
		s.error(w, 400, "CURSOR_INVALID", "分页已失效，请刷新")
		return
	}
	rows, err := s.db.Query("SELECT "+commerceProductColumns+" FROM commerce_products p"+q.where()+order, q.args...)
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	products := []commerceProduct{}
	for rows.Next() {
		p, scanErr := scanCommerceProduct(rows)
		if scanErr != nil {
			err = scanErr
			break
		}
		products = append(products, p)
	}
	rowErr := rows.Err()
	rows.Close()
	if err != nil || rowErr != nil {
		s.commerceProductFailure(w, errors.Join(err, rowErr))
		return
	}
	limit := clampInt(parseQueryInt(r.URL.Query().Get("limit"), 40), 1, 200)
	next := ""
	if len(products) > limit {
		products = products[:limit]
		last := products[limit-1]
		next = encodePageCursor(last.UpdatedAt, last.ID, r.URL.Query().Get("sort") == "oldest")
	}
	s.json(w, 200, map[string]any{"products": products, "total": total, "nextCursor": next})
}

func (s *Service) commerceProductByID(w http.ResponseWriter, r *http.Request, id, action string) {
	uid, ok := s.requireLibraryUser(w, r)
	if !ok {
		return
	}
	if id == "" || len(id) > 200 {
		s.error(w, 404, "PRODUCT_NOT_FOUND", "商品档案不存在")
		return
	}
	if action == "versions" && r.Method == http.MethodGet {
		s.commerceProductVersions(w, r, uid, id)
		return
	}
	if action == "adopt" && r.Method == http.MethodPost {
		s.adoptCommerceProductVersion(w, r, uid, id)
		return
	}
	if action != "" {
		s.error(w, 404, "NOT_FOUND", "操作不存在")
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.respondCommerceProduct(w, uid, id, 200)
	case http.MethodPatch:
		s.saveCommerceProduct(w, r, uid, id)
	case http.MethodDelete:
		s.deleteCommerceProduct(w, uid, id)
	default:
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
	}
}

func (s *Service) respondCommerceProduct(w http.ResponseWriter, uid, id string, status int) {
	p, err := scanCommerceProduct(s.db.QueryRow("SELECT "+commerceProductColumns+" FROM commerce_products p WHERE p.id=$1 AND p.user_id=$2", id, uid))
	if err == sql.ErrNoRows {
		s.error(w, 404, "PRODUCT_NOT_FOUND", "商品档案不存在或无权访问")
		return
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	s.json(w, status, map[string]any{"product": p})
}

func (s *Service) saveCommerceProduct(w http.ResponseWriter, r *http.Request, uid, id string) {
	var input commerceProductInput
	if !decode(r, &input) {
		s.error(w, 400, "PRODUCT_INPUT_INVALID", "商品资料格式不正确")
		return
	}
	if err := normalizeCommerceProduct(&input, false); err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	defer tx.Rollback()
	creating := id == ""
	if !creating {
		var version int
		err = tx.QueryRow("SELECT version FROM commerce_products WHERE id=$1 AND user_id=$2 FOR UPDATE", id, uid).Scan(&version)
		if err == sql.ErrNoRows {
			s.error(w, 404, "PRODUCT_NOT_FOUND", "商品档案不存在或无权访问")
			return
		}
		if err != nil {
			s.commerceProductFailure(w, err)
			return
		}
		if input.Version != version {
			s.error(w, 409, "PRODUCT_VERSION_CONFLICT", "商品档案已更新，请重新载入并确认后保存")
			return
		}
	}
	if err := validateCommerceProductAssetsTx(tx, uid, input); err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	original, _ := json.Marshal(input.ProductAssetIDs)
	references, _ := json.Marshal(input.ReferenceAssetIDs)
	status := 200
	if creating {
		id, status = idgen.New(), 201
		_, err = tx.Exec(`INSERT INTO commerce_products(id,user_id,project_id,name,description,selling_points,preserve_details,product_asset_ids,reference_asset_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, id, uid, repository.NullableString(input.ProjectID), input.Name, input.Description, input.SellingPoints, input.PreserveDetails, original, references)
	} else {
		_, err = tx.Exec(`UPDATE commerce_products SET project_id=$3,name=$4,description=$5,selling_points=$6,preserve_details=$7,product_asset_ids=$8::jsonb,reference_asset_ids=$9::jsonb,version=version+1,updated_at=now() WHERE id=$1 AND user_id=$2`, id, uid, repository.NullableString(input.ProjectID), input.Name, input.Description, input.SellingPoints, input.PreserveDetails, original, references)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	s.respondCommerceProduct(w, uid, id, status)
}

func (s *Service) deleteCommerceProduct(w http.ResponseWriter, uid, id string) {
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
	var active bool
	if err = tx.QueryRow("SELECT EXISTS(SELECT 1 FROM generation_tasks WHERE user_id=$1 AND input->>'productId'=$2 AND status IN ('queued','processing','waiting_provider'))", uid, id).Scan(&active); err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	if active {
		s.error(w, 409, "PRODUCT_IN_USE", "商品图片仍在生成，请等待任务完成后再删除档案")
		return
	}
	_, err = tx.Exec("DELETE FROM commerce_products WHERE id=$1 AND user_id=$2", id, uid)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		s.commerceProductFailure(w, err)
		return
	}
	s.json(w, 200, map[string]any{"deleted": id})
}
