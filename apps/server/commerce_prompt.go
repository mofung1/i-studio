package main

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

func commercePromptForInput(input map[string]any) string {
	taskType := stringValue(input["taskType"], "")
	parts := []string{}
	if text := strings.TrimSpace(stringValue(input["prompt"], "")); text != "" {
		parts = append(parts, text)
	} else {
		parts = append(parts, stringValue(input["productName"], "商品"))
		if text := strings.TrimSpace(stringValue(input["requirements"], "")); text != "" {
			parts = append(parts, "用户需求："+text)
		}
	}
	parts = append(parts, generationText(input, "image.commerce.common"))
	productCount := len(stringsFromArray(input["productAssetIds"]))
	for index, image := range sourceImages(input) {
		role := image["role"]
		if role == "" {
			role = "product"
			if productCount > 0 && index >= productCount {
				role = "reference"
			}
		}
		if role == "reference" {
			parts = append(parts, fmt.Sprintf("参考图片 %d：爆款视觉参考，只用于构图、背景、布光和视觉层次，不能提供商品外观、品牌或营销文案", index+1))
		} else {
			parts = append(parts, fmt.Sprintf("参考图片 %d：商品原图，以这张图里的商品外观和包装为准；多张商品图是同一商品的不同视角，不是需要同时摆放的多个商品", index+1))
		}
	}
	switch taskType {
	case "product-main":
		parts = append(parts, generationText(input, "image.product-main"))
		if stringValue(input["moduleMode"], "smart") != "custom" && stringValue(input["moduleHint"], "") == "" {
			parts = append(parts, generationText(input, "image.product-main.smart"))
			if stringValue(input["platform"], "") == "amazon" {
				parts = append(parts, configuredModuleHint(input, "product-main", "white"))
			}
		}
	case "detail-page":
		parts = append(parts, generationText(input, "image.detail-page"))
		if stringValue(input["moduleMode"], "smart") != "custom" && stringValue(input["moduleHint"], "") == "" {
			parts = append(parts, generationText(input, "image.detail-page.smart"))
		}
	case "viral-recreate":
		if stringValue(input["recreateStrength"], "style") == "high" {
			parts = append(parts, generationText(input, "image.recreate.high"))
		} else {
			parts = append(parts, generationText(input, "image.recreate.style"))
		}
	case "product-retouch":
		parts = append(parts, generationText(input, "image.product-retouch"))
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
			parts = append(parts, "产品精修要求："+details)
		}
	}
	if hint := stringValue(input["moduleHint"], ""); hint != "" {
		parts = append(parts, "本张图片的生成方向："+hint)
	}
	platforms := map[string]string{"smart": "根据商品用途安排", "taobao": "淘宝", "1688": "1688", "tmall": "天猫", "pinduoduo": "拼多多", "jd": "京东", "douyin": "抖音", "amazon": "Amazon", "temu": "TEMU", "ebay": "eBay"}
	if name := platforms[stringValue(input["platform"], "")]; name != "" {
		parts = append(parts, "适配目标平台："+name)
	}
	if scene := stringValue(input["sceneDescription"], ""); scene != "" {
		parts = append(parts, scene)
	}
	parts = append(parts, stringsFromArray(input["sellingPoints"])...)
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
