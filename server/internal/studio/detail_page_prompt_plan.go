package studio

import (
	"fmt"
	"strings"
)

// detailInformationModules 是需要先排版信息、再放商品图的信息型模块。
// 这些模块必须明确“资料缺失时退回商品展示”，避免模型补写参数或评价。
var detailInformationModules = stringSet(
	"selling", "spec", "feedback", "certificate", "install", "faq", "size", "promotion",
)

// detailPagePromptForInput 组织详情页的逐模块提示词：
// 商品身份与整组一致性在前，本张模块任务居中，最后收束到信息边界与文字政策。
// 每个模块只表达自己那一层，避免详情页被模型写成一张信息堆满的主图。
func detailPagePromptForInput(input map[string]any) string {
	plan := promptPlan{maxRunes: promptModelProfileFor(input).MaxRunes}
	plan.add("request", commercePrimaryRequest(input, true), 0, true)
	plan.add("image.commerce.common", generationText(input, "image.commerce.common"), 0, true)
	for _, line := range commerceReferenceRoleLines(input) {
		plan.add("reference", line, 0, true)
	}
	plan.add("image.detail-page", generationText(input, "image.detail-page"), 0, true)

	module, hint := detailPageModule(input)
	if hint != "" {
		plan.add("module", hint, 0, true)
	} else if stringValue(input["moduleMode"], "smart") != "custom" {
		plan.add("image.detail-page.smart", generationText(input, "image.detail-page.smart"), 1, false)
	}
	if sequence := detailPageSequenceText(input, module); sequence != "" {
		plan.add("sequence", sequence, 2, false)
	}
	if _, information := detailInformationModules[module]; information {
		plan.add("image.detail-page.information", generationText(input, "image.detail-page.information"), 0, true)
		if language := stringValue(input["outputLanguage"], ""); language == "" || language == "none" {
			plan.add("image.detail-page.information.visual", generationText(input, "image.detail-page.information.visual"), 1, false)
		}
	}
	plan.add("platform", detailPagePlatformText(input), 1, false)
	if scene := strings.TrimSpace(stringValue(input["sceneDescription"], "")); scene != "" {
		plan.add("scene", "场景与背景："+scene, 2, false)
	}
	if points := stringsFromArray(input["sellingPoints"]); len(points) > 0 {
		plan.add("sellingPoints", "已确认卖点："+joinPromptParts(points, "；"), 1, false)
	}
	if text := strings.TrimSpace(stringValue(input["redoInstructions"], "")); text != "" {
		plan.add("redo", "本次仅重做这一张，按本次调整要求修改指定细节："+text, 1, false)
	}
	if key, text := commerceTextPolicy(input); text != "" {
		plan.add(key, text, 0, true)
	}
	plan.add("image.commerce.consistency", generationText(input, "image.commerce.consistency"), 2, false)
	return plan.render()
}

// detailPageModule 取当前图片所属模块与模块说明。
// 队列逐模块生成时会写入 generationModule；旧任务或手工调用只有 moduleHint，
// 此时仍可使用说明，但无法套用模块级的信息型约束。
func detailPageModule(input map[string]any) (string, string) {
	module := strings.TrimSpace(stringValue(input["generationModule"], ""))
	hint := strings.TrimSpace(stringValue(input["moduleHint"], ""))
	if hint == "" && module != "" {
		hint = strings.TrimSpace(configuredModuleHint(input, "detail-page", module))
	}
	return module, hint
}

// detailPageSequenceText 告诉模型本张在整组详情中的位置，
// 让首屏、中段和结尾各自承担合适的视觉任务，而不是每张都塞满信息。
func detailPageSequenceText(input map[string]any, module string) string {
	if module == "" {
		return ""
	}
	label := moduleLabel(module)
	if label == "" || label == module {
		return ""
	}
	counts, _ := input["moduleCounts"].(map[string]any)
	order, err := generationModuleOrder(input, counts)
	if err != nil || len(order) <= 1 {
		return ""
	}
	position := 0
	for index, key := range order {
		if key == module {
			position = index + 1
			break
		}
	}
	if position == 0 {
		return ""
	}
	return fmt.Sprintf("本张是详情组第 %d/%d 个模块：%s。按模块顺序控制信息密度，本张只表达该模块，不提前塞入后续模块内容", position, len(order), label)
}

// detailPagePlatformText 优先使用详情页专用的平台规则。
// 白底主图占比、主图留白等规则不直接套到详情模块上。
func detailPagePlatformText(input map[string]any) string {
	platform := strings.TrimSpace(stringValue(input["platform"], ""))
	if platform == "" {
		return ""
	}
	if text := strings.TrimSpace(generationText(input, "platform."+platform+".detail")); text != "" {
		return text
	}
	return platformPromptText(input)
}
