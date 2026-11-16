package studio

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

var commercePurposeDescriptions = map[string]string{
	"main":          "商品主图：主体完整、清晰突出，背景简洁，准确呈现商品外观。",
	"scene":         "商品场景图：将真实商品自然置入合适的使用环境，保持可信的比例、结构和光影。",
	"detail":        "商品细节图：展示参考图片中真实可见的细节、材质和工艺，不猜测未展示的背面或内部结构。",
	"selling-point": "商品卖点图：围绕商家确认的卖点组织画面，用场景和构图表达，不新增未经确认的功能、参数或文字。",
}

// hydrateProductGeneration rebuilds all trusted product data at submission.
// Keeping the user's instructions separately makes repeated validation and
// retry hydration idempotent, without repeatedly appending the product brief.
func (s *Service) hydrateProductGeneration(uid string, input map[string]any) error {
	delete(input, "productSnapshot")
	if _, exists := input["productId"]; !exists {
		return nil
	}
	id, ok := input["productId"].(string)
	if !ok || id == "" || len(id) > 200 || s.db == nil {
		return &operationError{400, "PRODUCT_INPUT_INVALID", "请选择商品档案"}
	}
	purpose, ok := input["productPurpose"].(string)
	if !ok || commercePurposeDescriptions[purpose] == "" {
		return &operationError{400, "PRODUCT_PURPOSE_INVALID", "请选择主图、场景图、细节图或卖点图"}
	}
	if !isJSONInteger(input["productVersion"]) || input["productVersion"].(float64) < 1 {
		return &operationError{400, "PRODUCT_VERSION_INVALID", "请重新载入商品档案后生成"}
	}
	p, err := scanCommerceProduct(s.db.QueryRow("SELECT "+commerceProductColumns+" FROM commerce_products p WHERE p.id=$1 AND p.user_id=$2", id, uid))
	if err == sql.ErrNoRows {
		return &operationError{404, "PRODUCT_NOT_FOUND", "商品档案不存在或无权访问"}
	}
	if err != nil {
		return err
	}
	if int(input["productVersion"].(float64)) != p.Version {
		return &operationError{409, "PRODUCT_VERSION_CONFLICT", "商品档案已更新，请先刷新页面确认已有任务，再确认最新资料后生成"}
	}
	if err := normalizeCommerceProduct(&p.commerceProductInput, false); err != nil {
		return err
	}
	instructions, exists := input["productInstructions"]
	if !exists {
		instructions = input["prompt"]
		if instructions == nil {
			instructions = ""
		}
	}
	text, ok := instructions.(string)
	if !ok || len([]rune(strings.TrimSpace(text))) > 2000 {
		return &operationError{400, "PRODUCT_INPUT_INVALID", "补充要求最多 2000 字"}
	}
	text = strings.TrimSpace(text)
	parent := ""
	if raw, exists := input["parentAssetId"]; exists {
		parent, ok = raw.(string)
		if !ok || parent == "" || len(parent) > 200 {
			return &operationError{400, "PRODUCT_VERSION_INVALID", "请选择需要修改的商品图片"}
		}
		var parentRaw []byte
		err := s.db.QueryRow("SELECT t.input"+commerceVersionFrom+" WHERE a.id=$1 AND a.user_id=$2 AND t.input->>'productId'=$3 AND "+commerceVersionConditions, parent, uid, id).Scan(&parentRaw)
		if err == sql.ErrNoRows {
			return &operationError{404, "PRODUCT_VERSION_NOT_FOUND", "需要修改的图片不是该商品已完成的候选版本"}
		}
		if err != nil {
			return err
		}
		var parentInput map[string]any
		if err = json.Unmarshal(parentRaw, &parentInput); err != nil {
			return err
		}
		if stringValue(parentInput["productPurpose"], "") != purpose {
			return &operationError{400, "PRODUCT_PURPOSE_INVALID", "局部修改需保留原图用途，请从对应候选图片进入编辑"}
		}
		input["aspectRatio"] = stringValue(parentInput["aspectRatio"], "1:1")
		input["resolution"] = stringValue(parentInput["resolution"], "2K")
	}
	if count, exists := input["count"]; exists && (!isJSONInteger(count) || count.(float64) < 1 || count.(float64) > 4) {
		return &operationError{400, "COUNT_INVALID", "每次生成 1–4 张商品图片"}
	}
	input["productInstructions"] = text
	input["productSnapshot"] = map[string]any{
		"id": p.ID, "version": p.Version, "name": p.Name, "description": p.Description,
		"sellingPoints": p.SellingPoints, "preserveDetails": p.PreserveDetails,
		"productAssetIds": p.ProductAssetIDs, "referenceAssetIds": p.ReferenceAssetIDs,
	}
	input["mode"] = "general"
	for _, key := range []string{"taskType", "productAssetIds", "requirements", "moduleCounts", "moduleMode", "clothingPlan", "modelAssetId", "sceneAssetId"} {
		delete(input, key)
	}
	if p.ProjectID == "" {
		delete(input, "projectId")
	} else {
		input["projectId"] = p.ProjectID
	}
	refs := []any{}
	if parent != "" {
		refs = append(refs, parent)
	} else {
		for _, ids := range [][]string{p.ProductAssetIDs, p.ReferenceAssetIDs} {
			for _, assetID := range ids {
				refs = append(refs, assetID)
			}
		}
	}
	input["referenceAssetIds"] = refs
	input["prompt"] = commerceProductPrompt(p, purpose, text, parent != "")
	return nil
}

func commerceProductPrompt(p commerceProduct, purpose, instructions string, editing bool) string {
	parts := []string{"为商家制作商品图片。以商家提供的真实图片和已确认资料为依据，不编造商品规格、功效、认证、价格或促销承诺。", commercePurposeDescriptions[purpose]}
	if editing {
		parts = append(parts, "图片 1 是当前需要修改的成片。仅按照选区与修改要求处理，尽量保留其余构图、商品外观、包装文字、颜色和 Logo。不要重新设计整幅图片。")
	} else {
		for i := range p.ProductAssetIDs {
			parts = append(parts, fmt.Sprintf("图片 %d：商品原图。它决定商品身份、形状、颜色、结构、Logo 和包装细节。", i+1))
		}
		for i := range p.ReferenceAssetIDs {
			parts = append(parts, fmt.Sprintf("图片 %d：风格参考。只参考背景、光线、色调与构图，不复制其中的商品、人物、品牌或文字。", len(p.ProductAssetIDs)+i+1))
		}
	}
	parts = append(parts, "商品名称："+p.Name)
	for _, field := range []struct{ label, value string }{{"商品描述", p.Description}, {"商家确认的卖点", p.SellingPoints}, {"必须保留的特征", p.PreserveDetails}, {"本次补充要求", instructions}} {
		if field.value != "" {
			parts = append(parts, field.label+"："+field.value)
		}
	}
	parts = append(parts, "保留商品本身已有文字。除非本次补充要求明确指定，否则不新增广告文案或标识。")
	return strings.Join(parts, "\n")
}

// Called within credit reservation, after hydration and before task creation.
// A shared row lock prevents a concurrent brief update or deletion from changing
// the meaning of a task while its charge and input snapshot are committed.
func validateProductOwnershipTx(tx *sql.Tx, uid string, input map[string]any) error {
	id := stringValue(input["productId"], "")
	if id == "" {
		return nil
	}
	var version int
	var project string
	var originals, references []byte
	err := tx.QueryRow("SELECT version,COALESCE(project_id,''),product_asset_ids,reference_asset_ids FROM commerce_products WHERE id=$1 AND user_id=$2 FOR SHARE", id, uid).Scan(&version, &project, &originals, &references)
	if err == sql.ErrNoRows {
		return &operationError{404, "PRODUCT_NOT_FOUND", "商品档案不存在或无权访问"}
	}
	if err != nil {
		return err
	}
	if !isJSONInteger(input["productVersion"]) || int(input["productVersion"].(float64)) != version {
		return &operationError{409, "PRODUCT_VERSION_CONFLICT", "商品档案已更新，请先刷新页面确认已有任务，再确认最新资料后生成"}
	}
	brief := commerceProductInput{ProjectID: project}
	if json.Unmarshal(originals, &brief.ProductAssetIDs) != nil || json.Unmarshal(references, &brief.ReferenceAssetIDs) != nil {
		return fmt.Errorf("invalid stored product references")
	}
	if parent := stringValue(input["parentAssetId"], ""); parent != "" {
		var found string
		err = tx.QueryRow("SELECT a.id"+commerceVersionFrom+" WHERE a.id=$1 AND a.user_id=$2 AND t.input->>'productId'=$3 AND t.input->>'productPurpose'=$4 AND "+commerceVersionConditions+" FOR KEY SHARE OF a,t", parent, uid, id, stringValue(input["productPurpose"], "")).Scan(&found)
		if err == sql.ErrNoRows {
			return &operationError{404, "PRODUCT_VERSION_NOT_FOUND", "需要修改的图片不是该商品、该用途的已完成候选版本"}
		}
		if err != nil {
			return err
		}
		// Editing only needs the selected result, so deleted source uploads do
		// not prevent repairing an already delivered image.
		brief.ProductAssetIDs, brief.ReferenceAssetIDs = []string{parent}, nil
	}
	return validateCommerceProductAssetsTx(tx, uid, brief)
}
