package studio

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func detailPlanInput(module, platform string) map[string]any {
	return map[string]any{
		"mode": "commerce", "taskType": "detail-page", "moduleMode": "custom",
		"generationModule": module, "moduleHint": commerceModuleHint("detail-page", module),
		"moduleCounts": map[string]any{module: float64(1)}, "moduleOrder": []any{module},
		"platform": platform, "outputLanguage": "none", "prompt": "突出商品本身的质感",
		"productAssetIds": []any{"product"},
		"sourceImages":    []map[string]string{{"role": "product"}},
	}
}

func TestDetailPagePromptPlanKeepsEachModuleDistinct(t *testing.T) {
	seen := map[string]string{}
	for module := range allowedModules["detail-page"] {
		prompt := promptForInput(detailPlanInput(module, "smart"))
		if !strings.Contains(prompt, commerceModuleHint("detail-page", module)) {
			t.Fatalf("%s lost its module brief: %s", module, prompt)
		}
		if !strings.Contains(prompt, "每张只承担一个模块的表达任务") {
			t.Fatalf("%s lost the detail-page task brief: %s", module, prompt)
		}
		if previous, exists := seen[prompt]; exists {
			t.Fatalf("%s and %s produced the same prompt", previous, module)
		}
		seen[prompt] = module
	}
}

func TestDetailInformationModulesAddLayoutAndFactBoundary(t *testing.T) {
	information := []string{"selling", "spec", "feedback", "certificate", "install", "faq", "size", "promotion"}
	for _, module := range information {
		prompt := promptForInput(detailPlanInput(module, "smart"))
		for _, wanted := range []string{"信息型详情模块先安排信息层级", "缺失时改用商品展示", "不生成占位数字", "不生成空白文字框"} {
			if !strings.Contains(prompt, wanted) {
				t.Fatalf("%s missing information policy %q: %s", module, wanted, prompt)
			}
		}
	}
	for _, module := range []string{"hero", "scene", "detail", "material", "package", "brand"} {
		prompt := promptForInput(detailPlanInput(module, "smart"))
		if strings.Contains(prompt, "信息型详情模块先安排信息层级") {
			t.Fatalf("visual module %s was treated as an information layout: %s", module, prompt)
		}
	}
}

func TestDetailPageSequenceFollowsSelectedModuleOrder(t *testing.T) {
	input := detailPlanInput("selling", "smart")
	input["moduleCounts"] = map[string]any{"hero": float64(1), "selling": float64(1)}
	input["moduleOrder"] = []any{"hero", "selling"}
	prompt := promptForInput(input)
	for _, wanted := range []string{"第 2/2 个模块", "核心卖点图", "不提前塞入后续模块内容"} {
		if !strings.Contains(prompt, wanted) {
			t.Fatalf("detail sequence missing %q: %s", wanted, prompt)
		}
	}

	single := promptForInput(detailPlanInput("hero", "smart"))
	if strings.Contains(single, "详情组第") {
		t.Fatalf("single-module detail prompt should not add a sequence line: %s", single)
	}
}

func TestDetailPagePlatformUsesDetailProfile(t *testing.T) {
	amazon := promptForInput(detailPlanInput("hero", "amazon"))
	for _, wanted := range []string{"不套用白底主图规范", "价格、促销、评价与星级只在用户明确提供"} {
		if !strings.Contains(amazon, wanted) {
			t.Fatalf("amazon detail profile missing %q: %s", wanted, amazon)
		}
	}
	if strings.Contains(amazon, "商品及其原包装合计约占画面 85%") {
		t.Fatalf("amazon main-image rule leaked into detail modules: %s", amazon)
	}
	for platform, wanted := range map[string]string{
		"taobao": "竖版长图切片",
		"douyin": "避开底部文案与界面安全区",
		"smart":  "商品避开画面四边",
		"jd":     "适配目标平台：京东",
	} {
		prompt := promptForInput(detailPlanInput("scene", platform))
		if !strings.Contains(prompt, wanted) {
			t.Fatalf("%s detail platform missing %q: %s", platform, wanted, prompt)
		}
	}
}

func TestDetailPageSmartModeExplainsAutomaticModules(t *testing.T) {
	prompt := promptForInput(map[string]any{
		"mode": "commerce", "taskType": "detail-page", "moduleMode": "smart",
		"platform": "smart", "outputLanguage": "none", "prompt": "做一套商品详情",
	})
	if !strings.Contains(prompt, "一张详情首屏概览") {
		t.Fatalf("smart detail prompt lost the automatic module brief: %s", prompt)
	}
	if strings.Contains(prompt, "信息型详情模块先安排信息层级") {
		t.Fatalf("smart detail prompt should not assume an information module: %s", prompt)
	}
}

func TestDetailPagePromptStaysWithinGeminiBudget(t *testing.T) {
	for module := range allowedModules["detail-page"] {
		input := detailPlanInput(module, "amazon")
		input["protocol"] = "gemini_native"
		input["sceneDescription"] = strings.Repeat("很长的场景描述", 50)
		input["sellingPoints"] = []any{strings.Repeat("卖点", 100)}
		prompt := promptForInput(input)
		if got := utf8.RuneCountInString(prompt); got > geminiPromptBudgetRunes {
			t.Fatalf("%s prompt has %d runes, budget is %d: %s", module, got, geminiPromptBudgetRunes, prompt)
		}
		if !strings.Contains(prompt, commerceModuleHint("detail-page", module)) {
			t.Fatalf("%s budget trimming dropped the module brief: %s", module, prompt)
		}
	}
}
