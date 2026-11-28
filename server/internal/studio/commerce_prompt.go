package studio

import (
	"fmt"
	"strings"
)

func commerceModuleHint(taskType, key string) string {
	if taskType == "" {
		taskType = "product-main"
	}
	return generationDefaults["module."+taskType+"."+key]
}

// commercePrimaryRequest 返回用户主描述；没有主描述时可按需退回商品名与需求。
// 商品主图需要商品名兜底，产品精修则只用用户明确写下的修改目标。
func commercePrimaryRequest(input map[string]any, withProductFallback bool) string {
	if prompt := strings.TrimSpace(stringValue(input["prompt"], "")); prompt != "" {
		return prompt
	}
	requirements := strings.TrimSpace(stringValue(input["requirements"], ""))
	if !withProductFallback {
		if requirements == "" {
			return ""
		}
		return "用户需求：" + requirements
	}
	parts := []string{stringValue(input["productName"], "商品")}
	if requirements != "" {
		parts = append(parts, "用户需求："+requirements)
	}
	return joinPromptParts(parts, "。")
}

// commerceReferenceRoleLines 按实际上传顺序给参考图编号并说明用途。
// 编号必须与附件顺序一致，模型才能把“第 N 张”对应到正确文件。
func commerceReferenceRoleLines(input map[string]any) []string {
	productCount := len(stringsFromArray(input["productAssetIds"]))
	images := sourceImages(input)
	lines := make([]string, 0, len(images))
	for index, image := range images {
		role := image["role"]
		if role == "" {
			role = "product"
			if productCount > 0 && index >= productCount {
				role = "reference"
			}
		}
		switch role {
		case "reference":
			lines = append(lines, fmt.Sprintf("参考图片 %d：爆款视觉参考，只用于构图、背景、布光和视觉层次，不能提供商品外观、品牌或营销文案", index+1))
		case redoResultRole:
			lines = append(lines, fmt.Sprintf("参考图片 %d：本次重做的成片，参考原有取景和布光，按重做要求调整，商品外观和包装以商品原图为准", index+1))
		default:
			lines = append(lines, fmt.Sprintf("参考图片 %d：商品原图，以这张图里的商品外观和包装为准；多张商品图是同一商品的不同视角，不是需要同时摆放的多个商品", index+1))
		}
	}
	return lines
}

func commerceRetouchChanges(input map[string]any) string {
	items := []string{}
	selected := stringsFromArray(input["enhancements"])
	for _, key := range selected {
		if hint := generationText(input, "retouch."+key); hint != "" {
			items = append(items, hint)
		}
	}
	if len(selected) == 0 {
		items = append(items, generationText(input, "retouch.basic"))
	}
	if details := joinPromptParts(items, "；"); details != "" {
		return "产品精修要求：" + details
	}
	return ""
}

// commercePromptForInput 处理爆款复刻与未知任务类型。
// 商品主图、详情页和产品精修使用各自的 prompt plan，避免把“拍摄一张图”
// “按模块成套产出”和“只改原图的一处”混成同一种提示词。
func commercePromptForInput(input map[string]any) string {
	taskType := stringValue(input["taskType"], "")
	parts := []string{commercePrimaryRequest(input, true)}
	parts = append(parts, generationText(input, "image.commerce.common"))
	parts = append(parts, commerceReferenceRoleLines(input)...)
	switch taskType {
	case "viral-recreate":
		if stringValue(input["recreateStrength"], "style") == "high" {
			parts = append(parts, generationText(input, "image.recreate.high"))
		} else {
			parts = append(parts, generationText(input, "image.recreate.style"))
		}
	}
	if hint := stringValue(input["moduleHint"], ""); hint != "" {
		parts = append(parts, "本张图片的生成方向："+hint)
	}
	parts = append(parts, platformPromptText(input))
	if scene := stringValue(input["sceneDescription"], ""); scene != "" {
		parts = append(parts, scene)
	}
	parts = append(parts, stringsFromArray(input["sellingPoints"])...)
	if text := stringValue(input["redoInstructions"], ""); text != "" {
		parts = append(parts, "本次仅重做这一张，按本次调整要求修改指定细节："+text)
	}
	appendCommerceTextPolicy(&parts, input)
	return joinPromptParts(parts, "。")
}

func stringsFromArray(value any) []string {
	switch items := value.(type) {
	case []string:
		return items
	case []any:
		result := make([]string, 0, len(items))
		for _, item := range items {
			if text, ok := item.(string); ok {
				result = append(result, text)
			}
		}
		return result
	default:
		return nil
	}
}
