package studio

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func assertPromptOrder(t *testing.T, prompt string, parts ...string) {
	t.Helper()
	last := -1
	for _, part := range parts {
		index := strings.Index(prompt, part)
		if index < 0 {
			t.Fatalf("prompt is missing %q: %s", part, prompt)
		}
		if index <= last {
			t.Fatalf("prompt section %q is out of order: %s", part, prompt)
		}
		last = index
	}
}

func TestGeneralPromptPlanAddsCraftAndKeepsUserText(t *testing.T) {
	input := map[string]any{
		"mode": "general", "prompt": "一只白色花瓶", "style": "studio",
		"referenceStrength": "low", "sourceImages": []map[string]string{{"role": "reference"}},
	}
	prompt := promptForInput(input)
	assertPromptOrder(t, prompt, "一只白色花瓶", "摄影棚商业摄影", "轻度视觉启发", "画面要求：", "一张完整独立的画面")
	for _, text := range []string{"光线、材质与细节服从画面媒介", "不添加未指定的文字"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("general prompt missing craft guardrail %q: %s", text, prompt)
		}
	}
}

func TestProductMainPromptPlanFollowsCommerceOrder(t *testing.T) {
	input := map[string]any{
		"mode": "commerce", "taskType": "product-main", "prompt": "突出杯盖密封",
		"productName": "保温杯", "moduleMode": "custom", "moduleHint": commerceModuleHint("product-main", "white"),
		"sceneDescription": "浅灰石材台面", "platform": "amazon", "sellingPoints": []any{"保温 6 小时"},
		"outputLanguage": "none", "productAssetIds": []any{"product"},
		"sourceImages": []map[string]string{{"role": "product"}},
	}
	prompt := promptForInput(input)
	assertPromptOrder(t, prompt,
		"突出杯盖密封",
		"商品原图是商品外观的唯一依据",
		"参考图片 1：商品原图",
		"制作商品主图",
		"纯白底主图",
		"场景与背景：浅灰石材台面",
		"适配 Amazon",
		"已知卖点：保温 6 小时",
		"不新增营销文案",
		"同一任务的多张图片",
	)
	if strings.Contains(prompt, "爆款视觉参考") {
		t.Fatalf("product reference was mislabeled as a viral reference: %s", prompt)
	}
	if !strings.Contains(prompt, "包装盒、配件与赠品属于商品组成") {
		t.Fatalf("product identity rule does not protect visible packaging and accessories: %s", prompt)
	}
}

func TestProductMainReferenceRolesMatchAttachments(t *testing.T) {
	input := map[string]any{
		"mode": "commerce", "taskType": "product-main", "outputLanguage": "none",
		"productAssetIds": []any{"front", "side"}, "referenceAssetIds": []any{"reference"},
		"sourceImages": []map[string]string{{"role": "product"}, {"role": "product"}, {"role": "reference"}},
	}
	prompt := promptForInput(input)
	for _, text := range []string{"参考图片 1：商品原图", "参考图片 2：商品原图", "参考图片 3：爆款视觉参考"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("product main lost attachment role %q: %s", text, prompt)
		}
	}
}

func TestCommercePlatformProfilesChangeGuidance(t *testing.T) {
	build := func(platform string) string {
		return promptForInput(map[string]any{
			"mode": "commerce", "taskType": "product-main", "platform": platform, "outputLanguage": "none",
		})
	}
	taobao, amazon, douyin := build("taobao"), build("amazon"), build("douyin")
	for platform, test := range map[string]struct {
		prompt string
		want   string
	}{
		"taobao": {taobao, "淘宝/天猫"},
		"amazon": {amazon, "RGB 255,255,255"},
		"douyin": {douyin, "竖版构图"},
	} {
		if !strings.Contains(test.prompt, test.want) {
			t.Fatalf("%s profile missing %q: %s", platform, test.want, test.prompt)
		}
	}
	if taobao == amazon || amazon == douyin || taobao == douyin {
		t.Fatal("platform profiles did not change the prompt")
	}
}

func TestProductRetouchPromptSeparatesChangesFromInvariants(t *testing.T) {
	input := map[string]any{
		"mode": "commerce", "taskType": "product-retouch", "prompt": "只处理杯身划痕",
		"enhancements": []any{"repair", "background"}, "outputLanguage": "none",
	}
	prompt := promptForInput(input)
	assertPromptOrder(t, prompt,
		"产品精修是原图局部编辑",
		"只处理杯身划痕",
		"产品精修要求：",
		"除本次修改项外",
		"不新增营销文案",
	)
	for _, text := range []string{"修复划痕与瑕疵", "净化背景", "原有机位", "不增加绿植", "商品保持主导比例", "多个商品、分屏或前后对照"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("retouch prompt missing %q: %s", text, prompt)
		}
	}
	if strings.Contains(prompt, "校正色彩") {
		t.Fatalf("unselected retouch item was added: %s", prompt)
	}
	fromRequirements := promptForInput(map[string]any{
		"mode": "commerce", "taskType": "product-retouch", "requirements": "只清理背景杂物",
	})
	if !strings.Contains(fromRequirements, "用户需求：只清理背景杂物") {
		t.Fatalf("retouch ignored the commerce requirements field: %s", fromRequirements)
	}
}

func TestPromptPlanDropsOptionalSectionsBeforeCorePolicies(t *testing.T) {
	input := map[string]any{
		"mode": "commerce", "taskType": "product-main", "protocol": "gemini_native",
		"prompt": "突出商品主体", "outputLanguage": "none",
		"sceneDescription": strings.Repeat("很长的场景描述", 400),
		"sellingPoints":    []any{strings.Repeat("卖点", 800)},
	}
	prompt := promptForInput(input)
	if got := utf8.RuneCountInString(prompt); got > geminiPromptBudgetRunes {
		t.Fatalf("gemini prompt has %d runes, budget is %d: %s", got, geminiPromptBudgetRunes, prompt)
	}
	for _, text := range []string{"突出商品主体", "商品原图是商品外观的唯一依据", "制作商品主图", "不新增营销文案"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("budget dropped required section %q: %s", text, prompt)
		}
	}
	if strings.Contains(prompt, "很长的场景描述") || strings.Contains(prompt, "卖点") {
		t.Fatalf("budget kept oversized optional sections: %s", prompt)
	}
}

func TestPromptModelProfileSelectsBudget(t *testing.T) {
	for _, test := range []struct {
		input map[string]any
		want  int
	}{
		{map[string]any{"protocol": "gemini_native"}, geminiPromptBudgetRunes},
		{map[string]any{"model": "gemini-3-pro-image-preview"}, geminiPromptBudgetRunes},
		{map[string]any{"model": "gpt-image-2"}, openAIPromptBudgetRunes},
	} {
		if got := promptModelProfileFor(test.input).MaxRunes; got != test.want {
			t.Fatalf("profile %v has budget %d, want %d", test.input, got, test.want)
		}
	}
}
