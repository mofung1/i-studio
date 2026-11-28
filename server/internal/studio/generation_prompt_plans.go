package studio

import "strings"

// generalPromptForInput 组织通用生图：用户原意最优先，其次风格与参考强度，
// 最后补上通用的构图、媒介与输出约束。
func generalPromptForInput(input map[string]any) string {
	prompt := strings.TrimSpace(stringValue(input["prompt"], ""))
	if prompt == "" {
		return ""
	}
	plan := promptPlan{maxRunes: promptModelProfileFor(input).MaxRunes}
	plan.add("prompt", prompt, 0, true)
	style := stringValue(input["style"], "unspecified")
	if style != "unspecified" && promptStyleLabels[style] != "" {
		plan.add("image.style."+style, generationText(input, "image.style."+style), 1, false)
	}
	if input["mode"] == "general" && len(sourceImages(input)) > 0 {
		strength := stringValue(input["referenceStrength"], "medium")
		plan.add("image.reference."+strength, generationText(input, "image.reference."+strength), 2, false)
	}
	plan.add("image.general.craft", generationText(input, "image.general.craft"), 2, false)
	plan.add("image.general.output", generationText(input, "image.general.output"), 3, false)
	return plan.render()
}

// productMainPromptForInput 组织商品主图：先去重商品身份与参考角色，
// 再落实本张图种的取景、场景、平台和已确认卖点。
func productMainPromptForInput(input map[string]any) string {
	plan := promptPlan{maxRunes: promptModelProfileFor(input).MaxRunes}
	plan.add("request", commercePrimaryRequest(input, true), 0, true)
	plan.add("image.commerce.common", generationText(input, "image.commerce.common"), 0, true)
	for _, line := range commerceReferenceRoleLines(input) {
		plan.add("reference", line, 0, true)
	}
	plan.add("image.product-main", generationText(input, "image.product-main"), 0, true)
	if hint := strings.TrimSpace(stringValue(input["moduleHint"], "")); hint != "" {
		plan.add("module.hint", "本张图片的生成方向："+hint, 0, false)
	} else if stringValue(input["moduleMode"], "smart") != "custom" {
		plan.add("image.product-main.smart", generationText(input, "image.product-main.smart"), 1, false)
		if stringValue(input["platform"], "") == "amazon" {
			plan.add("module.product-main.white", configuredModuleHint(input, "product-main", "white"), 2, false)
		}
	}
	if scene := strings.TrimSpace(stringValue(input["sceneDescription"], "")); scene != "" {
		plan.add("scene", "场景与背景："+scene, 1, false)
	}
	plan.add("platform", platformPromptText(input), 2, false)
	if points := stringsFromArray(input["sellingPoints"]); len(points) > 0 {
		plan.add("sellingPoints", "已知卖点："+joinPromptParts(points, "；"), 2, false)
	}
	if text := strings.TrimSpace(stringValue(input["redoInstructions"], "")); text != "" {
		plan.add("redo", "本次仅重做这一张，按本次调整要求修改指定细节："+text, 1, false)
	}
	if key, text := commerceTextPolicy(input); text != "" {
		plan.add(key, text, 0, true)
	}
	plan.add("image.commerce.consistency", generationText(input, "image.commerce.consistency"), 3, false)
	return plan.render()
}

// productRetouchPromptForInput 按“输入角色 → 编辑目标 → 本次修改 → 保留项”
// 组织精修提示词，避免整段描述被模型理解成重新拍摄。
func productRetouchPromptForInput(input map[string]any) string {
	plan := promptPlan{maxRunes: promptModelProfileFor(input).MaxRunes}
	for _, line := range commerceReferenceRoleLines(input) {
		plan.add("reference", line, 0, true)
	}
	plan.add("image.product-retouch", generationText(input, "image.product-retouch"), 0, true)
	plan.add("image.commerce.common", generationText(input, "image.commerce.common"), 0, true)
	plan.add("request", commercePrimaryRequest(input, false), 0, true)
	if changes := commerceRetouchChanges(input); changes != "" {
		plan.add("retouch.changes", changes, 0, true)
	}
	plan.add("image.edit.invariants", generationText(input, "image.edit.invariants"), 0, true)
	if text := strings.TrimSpace(stringValue(input["redoInstructions"], "")); text != "" {
		plan.add("redo", "本次仅重做这一张，按本次调整要求修改指定细节："+text, 1, false)
	}
	if key, text := commerceTextPolicy(input); text != "" {
		plan.add(key, text, 0, true)
	}
	return plan.render()
}
