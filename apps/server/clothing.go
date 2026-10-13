package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type clothingShot struct {
	ID          string `json:"id"`
	ModuleKey   string `json:"moduleKey"`
	Label       string `json:"label"`
	Description string `json:"description"`
}
type clothingPlan struct {
	Summary  string         `json:"summary"`
	Warnings []string       `json:"warnings"`
	Shots    []clothingShot `json:"shots"`
}

var clothingModules = []struct{ key, label, hint string }{
	{"clothing-front", "正面精修", "完整展示服装正面，干净背景，自然均匀光线，保持服装真实颜色、版型、印花与 Logo"},
	{"clothing-back", "背面精修", "展示服装背面结构，依据背面原图，不臆造不可见的图案、标签与工艺"},
	{"clothing-3d", "立体展示", "生成白底的服装静态立体效果图，展示真实廓形、垂坠和厚度，不出现人体或杂物"},
	{"clothing-mannequin", "人台展示", "服装穿在人台上，白底摄影，展示版型与垂坠；人台不是人物模特"},
	{"clothing-detail", "细节特写", "近景展示原图可见的面料纹理、领口、袖口、缝线或印花工艺，保持真实细节"},
	{"clothing-selling", "卖点图", "根据用户提供或图片可见的服装特点制作卖点图，不编造面料成分、尺码、性能、价格或认证"},
	{"clothing-model", "模特上身", "由上传模特穿着用户提供的同套服装，保留模特身份与服装外观，穿着结构自然合理"},
}

func clothingModule(key string) (string, string) {
	for _, module := range clothingModules {
		if module.key == key {
			return module.label, module.hint
		}
	}
	return "", ""
}

func validateClothingCounts(mode string, counts map[string]int) (int, error) {
	if mode != "product" && mode != "model" {
		return 0, fmt.Errorf("请选择商品组图或模特上身")
	}
	total := 0
	for key, count := range counts {
		label, _ := clothingModule(key)
		if label == "" || count < 1 || count > 4 || (mode == "model" && key != "clothing-model") || (mode == "product" && key == "clothing-model") {
			return 0, fmt.Errorf("服装图种或张数不正确")
		}
		total += count
	}
	if total < 1 || total > 16 || (mode == "model" && total > 4) {
		return 0, fmt.Errorf("商品组图支持 1–16 张，模特上身支持 1–4 张")
	}
	return total, nil
}

func clothingCounts(input map[string]any) (map[string]int, error) {
	raw, ok := input["moduleCounts"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("请先选择服装图种")
	}
	counts := map[string]int{}
	for key, value := range raw {
		if !isJSONInteger(value) {
			return nil, fmt.Errorf("图片张数必须为整数")
		}
		counts[key] = int(value.(float64))
	}
	return counts, nil
}

func validateClothingInput(input map[string]any) error {
	if err := validateStringArray(input, "referenceAssetIds", 0, 0, 200); err != nil {
		return fmt.Errorf("服装工作台请分别使用服装、模特和场景素材")
	}
	mode := stringValue(input["clothingMode"], "")
	counts, err := clothingCounts(input)
	if err != nil {
		return err
	}
	total, err := validateClothingCounts(mode, counts)
	if err != nil {
		return err
	}
	if intValue(input["count"], 1) != total {
		return fmt.Errorf("预计张数必须与服装图种一致")
	}
	if err := requireOneOf(input, "clothingStyle", stringSet("studio", "natural", "street", "editorial"), "studio"); err != nil {
		return err
	}
	if err := requireOneOf(input, "outputLanguage", allowedLanguages, "none"); err != nil {
		return err
	}
	if mode == "model" {
		if err := requireText(input, "modelAssetId", 1, 200); err != nil {
			return fmt.Errorf("模特上身需要上传模特照片")
		}
		if input["sceneAssetId"] != nil {
			if err := requireText(input, "sceneAssetId", 1, 200); err != nil {
				return err
			}
		}
	} else if input["modelAssetId"] != nil || input["sceneAssetId"] != nil {
		return fmt.Errorf("商品组图不使用模特与场景素材")
	}
	raw, err := json.Marshal(input["clothingPlan"])
	if err != nil {
		return err
	}
	var shots []clothingShot
	if err := json.Unmarshal(raw, &shots); err != nil {
		return fmt.Errorf("服装规划格式不正确")
	}
	return validateClothingShots(shots, counts, total)
}

func validateClothingShots(shots []clothingShot, counts map[string]int, total int) error {
	if len(shots) != total {
		return fmt.Errorf("请确认每张服装图片的生成规划")
	}
	actual := map[string]int{}
	ids := map[string]bool{}
	for _, shot := range shots {
		if strings.TrimSpace(shot.ID) == "" || len([]rune(shot.ID)) > 80 || ids[shot.ID] || strings.TrimSpace(shot.Label) == "" || len([]rune(shot.Label)) > 80 || strings.TrimSpace(shot.Description) == "" || len([]rune(shot.Description)) > 2000 || counts[shot.ModuleKey] == 0 {
			return fmt.Errorf("每张规划需要唯一标识、图种、名称与描述")
		}
		ids[shot.ID] = true
		actual[shot.ModuleKey]++
	}
	for key, count := range counts {
		if actual[key] != count {
			return fmt.Errorf("生成规划与所选图种和张数不一致")
		}
	}
	return nil
}

func baseClothingPlan(mode string, counts map[string]int, requirements string) clothingPlan {
	plan := clothingPlan{Summary: "以原图服装为准，整组采用统一的光线和背景，每张都是独立成片。", Warnings: []string{}, Shots: []clothingShot{}}
	poses := []string{"正面自然站姿，完整展示整套穿搭", "侧面站姿，展示服装廓形与垂坠", "自然行走姿态，服装清晰完整", "场景全身照，保持同一模特与穿搭"}
	for _, module := range clothingModules {
		for i := 0; i < counts[module.key]; i++ {
			description := module.hint
			if mode == "model" {
				description += "。" + poses[i]
			}
			if requirements != "" {
				description += "。结合用户已填写的补充需求"
			}
			plan.Shots = append(plan.Shots, clothingShot{ID: fmt.Sprintf("%s-%d", module.key, i+1), ModuleKey: module.key, Label: fmt.Sprintf("%s %d", module.label, i+1), Description: description})
		}
	}
	if counts["clothing-back"] > 0 {
		plan.Warnings = append(plan.Warnings, "背面参考不足时，背面结构可能需要推测，请核对图片和规划。")
	}
	return plan
}

func (s *server) clothingPlanHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if !s.requireSettingsUser(w, r) {
		return
	}
	if s.promptClient == nil || (s.ai != nil && !s.ai.hasAny("prompt")) {
		s.error(w, 503, "CLOTHING_ANALYSIS_UNAVAILABLE", "未配置识图服务，请使用手动规划")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 24<<20)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		s.error(w, 400, "CLOTHING_INPUT_INVALID", "请检查图片，总大小最多 20 MB")
		return
	}
	defer r.MultipartForm.RemoveAll()
	mode := r.FormValue("clothingMode")
	options := map[string]any{"clothingStyle": r.FormValue("clothingStyle"), "aspectRatio": r.FormValue("aspectRatio"), "platform": r.FormValue("platform"), "outputLanguage": r.FormValue("outputLanguage")}
	for key, value := range options {
		if value == "" {
			delete(options, key)
		}
	}
	if requireOneOf(options, "clothingStyle", stringSet("studio", "natural", "street", "editorial"), "studio") != nil || requireOneOf(options, "aspectRatio", allowedRatios, "3:4") != nil || requireOneOf(options, "platform", allowedPlatforms, "smart") != nil || requireOneOf(options, "outputLanguage", allowedLanguages, "none") != nil {
		s.error(w, 400, "CLOTHING_INPUT_INVALID", "拍摄风格、比例或文字语言不正确")
		return
	}
	var counts map[string]int
	if json.Unmarshal([]byte(r.FormValue("moduleCounts")), &counts) != nil {
		s.error(w, 400, "CLOTHING_INPUT_INVALID", "请先选择服装图种")
		return
	}
	total, err := validateClothingCounts(mode, counts)
	if err != nil {
		s.error(w, 400, "CLOTHING_INPUT_INVALID", err.Error())
		return
	}
	requirements := strings.TrimSpace(r.FormValue("requirements"))
	if len([]rune(requirements)) > 2000 {
		s.error(w, 400, "CLOTHING_INPUT_INVALID", "补充要求最多 2000 字")
		return
	}
	images := []promptImage{}
	roles := []string{}
	totalBytes := 0
	for _, group := range []struct {
		key, role string
		min, max  int
	}{{"garmentImages", "服装原图", 1, 6}, {"modelImage", "模特参考，只保留人物身份", 0, 1}, {"sceneImage", "场景参考，只用于背景", 0, 1}} {
		files := r.MultipartForm.File[group.key]
		minimum := group.min
		if group.key == "modelImage" && mode == "model" {
			minimum = 1
		}
		if len(files) < minimum || len(files) > group.max || (mode == "product" && group.key != "garmentImages" && len(files) > 0) {
			s.error(w, 400, "CLOTHING_INPUT_INVALID", "服装图需为 1–6 张；模特上身需要 1 张模特图，场景图可选 1 张")
			return
		}
		for _, header := range files {
			file, err := header.Open()
			if err != nil {
				s.error(w, 400, "CLOTHING_IMAGE_INVALID", "图片读取失败")
				return
			}
			data, err := io.ReadAll(io.LimitReader(file, (10<<20)+1))
			file.Close()
			totalBytes += len(data)
			mime := http.DetectContentType(data)
			if err != nil || len(data) == 0 || len(data) > 10<<20 || totalBytes > 20<<20 || (mime != "image/png" && mime != "image/jpeg" && mime != "image/webp") {
				s.error(w, 400, "CLOTHING_IMAGE_INVALID", "请使用 PNG、JPG 或 WebP；单张最多 10 MB，总计最多 20 MB")
				return
			}
			images = append(images, promptImage{Mime: mime, Data: base64.StdEncoding.EncodeToString(data)})
			roles = append(roles, fmt.Sprintf("图片 %d：%s", len(images), group.role))
		}
	}
	plan := baseClothingPlan(mode, counts, requirements)
	starter, _ := json.Marshal(plan)
	system := `你是服装电商摄影策划。依据用户图片优化给出的 JSON 拍摄规划。只返回 JSON，字段为 summary、warnings、shots；每个 shot 必须原样保留 id 和 moduleKey，可以完善 label 与 description。不得改变顺序、图种或张数。描述每张图的拍摄视角、背景、光线与服装细节，每张都是独立成片。严格保留服装颜色、版型、印花、Logo 与工艺；模特参考仅用于人物身份，场景参考仅用于背景。只描述可见特征，不猜测面料成分、尺码、性能或认证；不可见的背面结构需在 warnings 说明。summary 最多 1200 字，warnings 最多 8 项，每项最多 300 字，每张 description 最多 2000 字。`
	userText := fmt.Sprintf("模式：%s；风格：%s；比例：%s；平台：%s；画面文字语言：%s\n补充要求：%s\n%s\n请优化这份规划：%s", mode, options["clothingStyle"], options["aspectRatio"], options["platform"], options["outputLanguage"], requirements, strings.Join(roles, "\n"), starter)
	text, err := s.promptClient.complete(r.Context(), system, userText, images, 4000)
	if err != nil {
		s.error(w, 502, "CLOTHING_ANALYSIS_FAILED", "服装分析失败，请重试或使用手动规划")
		return
	}
	var analyzed clothingPlan
	if json.Unmarshal([]byte(sanitizeModelText(text)), &analyzed) != nil || validateClothingShots(analyzed.Shots, counts, total) != nil || len([]rune(analyzed.Summary)) > 1200 || len(analyzed.Warnings) > 8 {
		s.error(w, 502, "CLOTHING_PLAN_INVALID", "AI 规划未完整覆盖所选图种，请重试或使用手动规划")
		return
	}
	for i, shot := range analyzed.Shots {
		if shot.ID != plan.Shots[i].ID || shot.ModuleKey != plan.Shots[i].ModuleKey {
			s.error(w, 502, "CLOTHING_PLAN_INVALID", "AI 规划改变了所选图种，请使用手动规划")
			return
		}
	}
	for _, warning := range analyzed.Warnings {
		if len([]rune(warning)) > 300 {
			s.error(w, 502, "CLOTHING_PLAN_INVALID", "AI 规划内容过长，请重试")
			return
		}
	}
	analyzed.Warnings = append(analyzed.Warnings, plan.Warnings...)
	w.Header().Set("Cache-Control", "no-store")
	s.json(w, 200, analyzed)
}

func clothingPromptForInput(input map[string]any) string {
	parts := []string{"服装电商摄影，每次只生成一张独立成片。服装原图是商品外观的唯一依据，必须保留真实颜色、版型、印花、Logo、纽扣和缝线，不替换款式，不新增配件或虚构面料成分、尺码、性能、价格和认证。不可见的结构、印花、标签与工艺不作具体臆造；背面素材不足时采用保守展示。整组采用统一光线、色温与背景逻辑。"}
	if stringValue(input["clothingMode"], "") == "model" {
		parts = append(parts, "模特穿着全部服装原图所组成的同套搭配。模特参考仅用于保持人物身份、脸部和体型，不复制模特原有衣服。场景参考仅用于背景，不复制其中的人物或服装。穿着结构与人体比例自然合理。")
	} else {
		parts = append(parts, "各张服装原图是同一件服装的不同视角，请保持同一件商品。")
	}
	for index, image := range sourceImages(input) {
		labels := map[string]string{"garment": "服装原图", "model": "模特参考，只用于人物身份", "scene": "场景参考，只用于背景"}
		parts = append(parts, fmt.Sprintf("参考图片 %d：%s", index+1, labels[image["role"]]))
	}
	styles := map[string]string{"studio": "摄影棚柔和均匀布光", "natural": "自然生活场景与自然光", "street": "真实街拍光线与环境", "editorial": "品牌画报，克制的时尚构图"}
	parts = append(parts, styles[stringValue(input["clothingStyle"], "studio")])
	parts = append(parts, "适配目标电商平台："+stringValue(input["platform"], "smart"))
	parts = append(parts, "本张拍摄规划："+stringValue(input["moduleHint"], ""))
	if text := stringValue(input["requirements"], ""); text != "" {
		parts = append(parts, "补充要求："+text)
	}
	appendCommerceTextPolicy(&parts, input)
	return strings.Join(parts, "。")
}
