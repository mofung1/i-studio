package main

import (
	"strings"
	"testing"
)

func TestCommerceCustomPromptKeepsTaskAndReferenceRules(t *testing.T) {
	input := map[string]any{
		"mode": "commerce", "taskType": "viral-recreate", "prompt": "用户提供的广告构图", "recreateStrength": "style",
		"productAssetIds": []any{"product"}, "referenceAssetIds": []any{"reference"}, "outputLanguage": "none",
		"sourceImages": []map[string]string{{"role": "product"}, {"role": "reference"}},
	}
	prompt := promptForInput(input)
	for _, text := range []string{"用户提供的广告构图", "参考图片 1：商品原图", "参考图片 2：爆款视觉参考", "参考风格", "不新增营销文案", "包装版式", "不编造"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("custom text bypassed required commerce policy %q: %s", text, prompt)
		}
	}
	input["recreateStrength"] = "high"
	strong := promptForInput(input)
	if prompt == strong || !strings.Contains(strong, "高度复刻") || !strings.Contains(strong, "不为了贴合参考而拉伸商品") {
		t.Fatal("reference strength did not change layout instructions while preserving the product")
	}
}

func TestRetouchStaysAnEditWithoutSelectedEnhancements(t *testing.T) {
	prompt := promptForInput(map[string]any{"mode": "commerce", "taskType": "product-retouch", "prompt": "修好商品照片"})
	for _, text := range []string{"原图局部编辑", "原有机位", "不增加绿植", "基础精修", "不新增营销文案"} {
		if !strings.Contains(prompt, text) {
			t.Fatalf("default retouch lost conservative editing policy %q", text)
		}
	}
}

func TestDetailModulesUseTheirOwnDirectionsAndRequireFacts(t *testing.T) {
	if commerceModuleHint("product-main", "selling") == commerceModuleHint("detail-page", "selling") {
		t.Fatal("detail selling module still uses main-image guidance")
	}
	for _, key := range []string{"spec", "feedback", "certificate", "size", "promotion", "package"} {
		hint := commerceModuleHint("detail-page", key)
		if !strings.Contains(hint, "提供") && !strings.Contains(hint, "明确") {
			t.Fatalf("%s does not restrict facts to supplied information: %s", key, hint)
		}
	}
	prompt := promptForInput(map[string]any{"mode": "commerce", "taskType": "detail-page", "moduleMode": "smart", "moduleCounts": map[string]any{}})
	if strings.Contains(prompt, "map[") || !strings.Contains(prompt, "一张详情首屏概览") {
		t.Fatal("smart detail plan is empty or leaks internal module serialization", prompt)
	}
	r := newPromptRequestWithFields(t, "token", "写商品详情", 0, [][2]string{
		{"taskType", "detail-page"}, {"moduleMode", "custom"}, {"modules", "核心卖点图×1"}, {"moduleKeys", "selling×1"},
	})
	if err := r.ParseMultipartForm(maxPromptBodySize); err != nil {
		t.Fatal(err)
	}
	if context := moduleContextText(r); !strings.Contains(context, "仅使用已提供的商品信息") {
		t.Fatal("prompt enhancement still uses unrelated main-image selling guidance", context)
	}
}

func TestCommerceSourceRolesMatchUploadedImageOrder(t *testing.T) {
	s := testSiteServer(t)
	s.db = isolatedTestDatabase(t)
	if _, err := s.db.Exec("INSERT INTO users(id,username,password_hash) VALUES('owner','owner','hash')"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"product-front", "product-side", "reference"} {
		if _, err := s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes) VALUES($1,'owner',$1,$1,'image/png',8)", id); err != nil {
			t.Fatal(err)
		}
		if err := s.storage.Save(id, strings.NewReader(id)); err != nil {
			t.Fatal(err)
		}
	}
	input := map[string]any{"mode": "commerce", "taskType": "viral-recreate", "productAssetIds": []any{"product-front", "product-side"}, "referenceAssetIds": []any{"reference"}}
	if err := s.attachSourceImages(input); err != nil {
		t.Fatal(err)
	}
	images := sourceImages(input)
	if len(images) != 3 || images[0]["role"] != "product" || images[1]["role"] != "product" || images[2]["role"] != "reference" {
		t.Fatalf("photo order lost its semantic roles: %v", images)
	}
	prompt := promptForInput(input)
	if !strings.Contains(prompt, "参考图片 3：爆款视觉参考") || !strings.Contains(prompt, "参考图片 2：商品原图") {
		t.Fatal("prompt image numbers do not match the actual attachments", prompt)
	}
}
