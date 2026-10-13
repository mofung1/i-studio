package main

import (
	"fmt"
	"strings"
)

func commerceModuleHint(taskType, key string) string {
	if taskType == "detail-page" {
		switch key {
		case "hero":
			return "详情首屏主视觉，商品完整清晰，标题与商品分区排版，用留白建立阅读层次，每张都是独立模块"
		case "selling":
			return "卖点详情图，突出一个已知特点，用商品外观与简洁排版说明，仅使用已提供的商品信息，不以想象的原料、成分、功效或认证作证明"
		}
	}
	return moduleHints[key]
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
	parts = append(parts,
		"商品原图是商品外观的唯一依据，保留真实形状、长宽比例、颜色、部件、包装版式与可见图案，不重新设计商品，不把参考图的商品混入结果",
		"信息仅来自用户明确提供的资料或原图清楚可见的内容，不编造成分、功效、尺寸、认证、销量、价格、评价或配件；看不清的文字保留其原有字形，不猜写",
		"每次只输出一张可使用的独立成片，不输出样张板、分屏对照、九宫格或编辑界面")
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
		parts = append(parts, "商品主图：单件商品为绝对主角，完整展示顶部、底部和左右轮廓，主体清晰且四周留必要边距，画面克制，背景不抢主体")
		if stringValue(input["moduleHint"], "") == "" {
			parts = append(parts, "智能模式默认制作干净的商品首图，不拼接整套图片")
			if stringValue(input["platform"], "") == "amazon" {
				parts = append(parts, moduleHints["white"])
			}
		}
	case "detail-page":
		parts = append(parts, "商品详情：按当前模块组织清晰的信息层次，主体与说明分区排列，标题、副标题和商品之间留白，避免夸张花字、过多装饰和文字堆叠；资料不足时优先展示外观与已知信息")
		if stringValue(input["moduleHint"], "") == "" {
			parts = append(parts, "智能模式默认生成一张详情首屏概览，突出商品和少量已知信息，不在一张图里塞入整套详情模块")
		}
	case "viral-recreate":
		if stringValue(input["recreateStrength"], "style") == "high" {
			parts = append(parts, "高度复刻参考图的视觉结构：尽量匹配商品位置、视角、背景、光向、留白与层次，但按真实商品形状适配构图，不为了贴合参考而拉伸商品。完全移除参考图的原商品、Logo和文案")
		} else {
			parts = append(parts, "参考风格：只借鉴配色、氛围和布光，围绕商品重新安排适合其形状的构图，不复制参考图的主体、品牌、文字或复杂摆件")
		}
	case "product-retouch":
		parts = append(parts, "产品精修采用原图局部编辑，保持原有机位、构图、商品大小与包装，只有用户指定的透视校正或换底可以改变对应部分。用户未要求时不增加绿植、摆件、装饰道具或新的场景，不把精修变为重新拍摄的广告图")
		items := []string{}
		for _, key := range stringsFromArray(input["enhancements"]) {
			if hint := enhancementHints[key]; hint != "" {
				items = append(items, hint)
			}
		}
		if len(items) == 0 {
			items = append(items, "基础精修只做轻度曝光、偏色、降噪与清晰度调整，保留真实材质和拍摄场景")
		}
		parts = append(parts, "产品精修要求："+strings.Join(items, "；"))
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
	return strings.Join(parts, "。")
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
