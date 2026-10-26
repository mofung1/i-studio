package studio

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
)

const (
	maxPromptImages    = 4
	maxPromptImageSize = 5 << 20  // 单张 5MB
	maxPromptBodySize  = 24 << 20 // 整个请求 24MB
	maxPromptTextRunes = 10000
)

const promptRewriteSystemPrompt = `你是图像创作编辑。请把用户的想法整理成可直接用于图像生成或图片编辑的提示词，让画面更明确，并保留用户自己的创意。

先在内部判断任务：从文字创作新画面、基于图片改善画面、转换画风，还是局部编辑。不要输出判断过程。

改写原则：
1. 用户明确指定的主体、数量、动作、空间关系、颜色、场景、风格、画面文字和禁止事项都必须保留。保留原有的否定、例外、先后关系与约束强度；不要把“只改背景”改成重新设计主体。引号内要出现在画面里的文字逐字保留，不翻译、不改写，也不新增标题、标语、Logo 或水印。
2. 按原文的信息量决定改写幅度。简短想法只补充最有帮助的两三处视觉细节；描述已经完整时只整理语序、消除歧义与重复，不重新创作。长提示词保留有用的细节，不为了压缩丢掉要求。连续点击优化时也不要不断扩写或更换方案。
3. 主体与关键关系优先，随后按需要自然描述构图、色彩、光线或表现媒介，不必凑齐固定栏目。不擅自新增人物、动物、道具、产品或故事情节；用户未指定的画面细节可作少量相容的补充，不改变主题与情绪。
4. 根据任务选择视觉语言：摄影描述机位、光向与真实材质；插画描述线条、色块、画材与笔触；平面设计描述形状、层级、间距与排版。不要给扁平插画强加摄影景深、写实材质或商业棚拍，不给随手记录强加电影感。用户未指定风格时沿用文字中的视觉倾向，不默认改成商业摄影。
5. 把抽象感受落实成少量可见的画面特征，例如“安静”可以表现为疏朗构图、柔和色彩与静止姿态。避免堆砌“高级感、极致细节、大师杰作、8K、超高清”等空泛质量词，也不要给所有画面套上居中、柔光、浅景深或大量留白。
6. 带图优化的重点是给出可执行的创作或修改指令。识图用于在内部理解现状、定位修改对象和保留项，不要把结果写成图片内容的逐项盘点。有文字时先落实文字里的目标，只补充与目标有关的图片细节；不把参考图现状写成必须保留的要求而抵消用户想做的改动。用户明确要求还原画面、描述图片或提取提示词时，才以画面还原为目标。用户文字与图片冲突时以文字为准；不猜测看不清的文字、身份、品牌或不可见的结构。没有图片时不得写成“参考图中的主体”或声称看到了图片。
7. 只有用户明确说图片“仅参考画风”时，才只提取线条、媒介、笔触和配色，不带入图片的主体、动作、场景、布局或文字。选择手绘或插画风格不等于图片仅作画风参考。把照片转成插画时，保留用户要求的人物特征、姿态与场景关系，以所选画材重新绘制，不只叠加滤镜。
8. 局部编辑先说明具体改动，再写清必须保留的部分；不追加未要求的美化、换装、重布光或场景重构。只有图片、没有文字目标时，以原图为基础给出一至三项与该图相适合的克制优化，例如改善主体辨识度、视觉层级、色调或边缘表现；根据实际画面选择，不套用所有项目，不虚构瑕疵，不新增主体、道具、文案或故事。用一句简短的保留要求固定原图主体与关键关系，将篇幅用于“怎么优化”，不要重新讲述整张图片。
9. 当前配置中的风格要求与参考要求会在生图时继续使用，改写应与其一致，不必机械复述配置。未指定或未启用的风格不要自行补成某一种。
10. 输出尽量精炼，不设最低字数；简单描述通常用一至三句话，复杂描述以保全原意为先。使用用户输入的语言；只有图片、没有文字时使用中文。不写分析、建议、标题、字段名、列表或 Markdown，不给整段提示词加外层引号，只输出提示词正文。

以下示例只说明改写尺度，不要把示例内容带入其他请求：
输入：一只橘猫趴在窗边，很安静。
输出：一只橘猫安静地趴在窗边，身体放松，窗外的光轻轻照在毛发上，画面节奏舒缓。
输入：蓝白双色扁平海报，左边月亮，右边写“晚安”，不要渐变。
输出：蓝白双色扁平海报，月亮位于画面左侧，右侧清晰排出“晚安”二字。使用纯色色块与清晰轮廓，不使用渐变，保持左右元素的视觉平衡。
输入：只把照片背景换成浅灰色，人物不要动。
输出：仅将照片背景替换为干净的浅灰色，保留人物原有的五官、表情、发型、服装、姿态、位置及光影，不改动人物。
输入：已上传人像照片；让这张图色调更通透，人物别变。
输出：以参考图为基础，调整画面色调与明暗层次，让肤色与背景的色彩更干净通透，保留自然的明暗过渡。保持人物的五官、表情、发型、服装、姿态与原有构图，不磨平皮肤纹理。`

const requirementSystemPrompt = `你是跨境电商视觉策划，同时也是文生图提示词工程师。请结合用户提供的文字、商品图片，以及当前任务类型、目标平台、模块组合、文字语言等参数，直接输出一段完整、可以拿去生成商品图的提示词。

要求：
1. 输出一段连续的文字：不要分行、不要写字段名或标题、不要使用 Markdown、不要加引号、不要用列表符号。
2. 内容顺序自然融入：商品主体与外包装特征 → 场景与环境 → 构图与视角 → 光线 → 材质与质感 → 风格与氛围 → 输出约束。
3. 图片里能直接看到的信息（外形、颜色、材质、包装文字与图案、原场景）优先采用；用户写的文字优先于推断。
4. 包装上原有的文字与 logo 必须保留并写清，不要改写、也不要杜撰新的文案；看不清或不确定的文字不要猜写，改为「保持包装原有文字与版式不变」。
5. 图片和文字都没有提到的氛围、构图和布光可按用途合理安排。产品精修默认保持原图场景，不推断新机位、绿植、摆件或装饰；只有用户明确要求换底或新增元素时才描述对应变化。
6. 结合目标平台的常见商品图习惯安排构图、留白与背景，让画面符合该平台的主流审美（不要编造平台硬性规范）。
7. 画面文字严格遵从「文字语言」参数；若要求不新增文字，则只保留商品原有包装文字。
8. 若给出了复刻程度或精修项，请把它们落实成具体的画面表述。
9. 严禁编造硬性事实：容量、功率、成分含量、认证与编号、销量、价格、品牌历史、获奖信息一律不写。
10. 使用与用户输入相同的语言；中文输入输出中文。
11. 若给出了「模块组合」，必须按模块逐个落实：模块名称、顺序与数量与用户选择一致，不得遗漏，也不得新增用户没有选择的模块；每个模块一句话写清拍什么、机位与构图、画面里要出现的信息或元素。
12. 每个模块产出的都是一张独立成片：不要拼贴多方案、过程稿、样张板或多格画布。
13. 规格参数、尺码对照、品质认证、常见问题、安装指引这类信息型模块，只描述版式与信息层级（标题区、内容块、图示方向、留白），不要编造具体参数、尺寸、认证编号或联系方式。
14. 整组图保持一致的色温、光线、机位语言与背景逻辑，让它看起来是同一套素材。
15. 材质与光影必须具体（材质关键词 + 布光方式），不要只写「高清」「高级」这类空词；画面文案克制，只保留商品原有包装文字和必要的 1-2 句卖点。
16. 长度控制在 1000 字以内；在保证信息完整的前提下尽量精炼；模块较多时每个模块用一句话概括。
17. 只输出这段提示词本身。`

// promptTaskGuidance 按任务类型追加一段说明：不同板块要表达的重点不同，
// 否则详情页很容易拿到一段与自身无关的主图式提示词。
var promptTaskGuidance = map[string]string{
	"product-main":    "本次任务是商品主图：画面要一眼看清商品本体与核心卖点，主体完整、背景干净、留白合理。",
	"detail-page":     "本次任务是电商详情页素材，会按用户选择的模块成套产出。请按模块名称、顺序与数量逐个落实，每个模块写清拍什么、机位与构图、画面里出现的信息或元素；整组保持统一的色温、光线与机位语言，看起来像同一套详情素材，不要只写成一张主图式的画面。",
	"viral-recreate":  "本次任务是爆款复刻：商品原图提供主体外观，最后一张爆款参考图只提供构图、背景、布光和视觉层次。参考风格允许围绕商品重构场景，高度复刻尽量保持构图与光影；两者都不能复制参考图商品、品牌或文案。",
	"product-retouch": "本次任务是产品精修：以原图做局部编辑，只落实用户选择的精修项，保留商品形状、真实配色、机位、包装文字与印刷纹理；默认清理杂物后延续原场景，不增加绿植、摆件或新的广告场景。",
}

// promptSystem 选择系统提示词，并按任务类型补上对应板块的表达重点。
func promptSystem(target, taskType string) string {
	if target == "requirements" {
		if guidance := promptTaskGuidance[strings.TrimSpace(taskType)]; guidance != "" {
			return requirementSystemPrompt + "\n\n" + guidance
		}
		return requirementSystemPrompt
	}
	return promptRewriteSystemPrompt
}

// promptEnhance 处理「AI 优化提示词 / AI 帮写」：文本或图片至少有一个才受理。
func (s *Service) promptEnhance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if !s.requireAuxiliaryUser(w, r) {
		return
	}
	if s.promptClient == nil || (s.ai != nil && !s.ai.hasAny("prompt")) {
		s.error(w, http.StatusServiceUnavailable, "PROMPT_AI_UNAVAILABLE", "请先在设置中配置提示词 AI 服务")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPromptBodySize)
	if err := r.ParseMultipartForm(maxPromptBodySize); err != nil {
		s.error(w, http.StatusBadRequest, "PROMPT_INPUT_INVALID", "请求内容无法解析，请重试")
		return
	}

	defer r.MultipartForm.RemoveAll()
	target := strings.TrimSpace(r.FormValue("target"))
	text := strings.TrimSpace(r.FormValue("text"))
	if len([]rune(text)) > maxPromptTextRunes {
		s.error(w, http.StatusBadRequest, "PROMPT_INPUT_TOO_LONG", "输入内容超过 10000 字，请精简后再试")
		return
	}

	images, _, err := s.readImageSources(r, "images", maxPromptImages, maxPromptImageSize)
	if err != nil {
		s.error(w, http.StatusBadRequest, "PROMPT_IMAGE_INVALID", err.Error())
		return
	}
	// 图片或文本必须至少有一个
	if text == "" && len(images) == 0 {
		s.error(w, http.StatusBadRequest, "PROMPT_INPUT_EMPTY", "请先上传图片或输入文字")
		return
	}

	if s.ai != nil && len(images) > 0 {
		e, err := s.ai.resolve("prompt", "", "")
		if err != nil {
			s.error(w, 503, "PROMPT_AI_UNAVAILABLE", err.Error())
			return
		}
		if !e.Capabilities["vision"] {
			s.error(w, 400, "PROMPT_VISION_UNSUPPORTED", "当前提示词模型不支持图片识别，请先输入大概的生图内容，再提交给 AI 优化提示词。")
			return
		}
	}
	system, userText, err := s.buildPrompt(target, text, r)
	if err != nil {
		s.error(w, 500, "PROMPT_STORAGE_ERROR", "提示词配置读取失败")
		return
	}

	uid, _ := s.authenticatedUserID(r)
	ctx, release, err := s.acquireAuxiliary(r.Context(), uid, "prompt_enhance")
	if err != nil {
		s.auxiliaryFailure(w, err)
		return
	}
	defer release()
	rewritten, err := s.promptClient.complete(ctx, system, userText, images, 4096)
	if err != nil {
		status, code, message := promptEnhanceError(err)
		log.Printf("prompt enhance failed: code=%s model=%q", code, s.promptClient.modelName())
		s.error(w, status, code, message)
		return
	}
	rewritten = strings.TrimSpace(rewritten)
	if rewritten == "" {
		s.error(w, http.StatusBadGateway, "PROMPT_ENHANCE_EMPTY", "AI 没有返回内容，请重试")
		return
	}

	s.json(w, http.StatusOK, map[string]any{
		"text":     rewritten,
		"model":    s.promptClient.modelName(),
		"fallback": false,
	})
}

// 前端传的是枚举值，这里翻译成模型能直接理解的中文业务语义。
var promptTaskTypeLabels = map[string]string{
	"product-main":    "商品主图（货架首图，主体突出）",
	"detail-page":     "电商详情页素材（强调卖点与细节）",
	"viral-recreate":  "爆款复刻（参考爆款视觉结构）",
	"product-retouch": "产品精修（保留真实商品外观）",
}

var promptPlatformLabels = map[string]string{
	"smart": "智能匹配", "taobao": "淘宝", "1688": "1688", "tmall": "天猫",
	"pinduoduo": "拼多多", "jd": "京东", "douyin": "抖音",
	"amazon": "亚马逊", "temu": "TEMU", "ebay": "eBay",
}

var promptStyleLabels = map[string]string{
	"unspecified": "不指定", "studio": "摄影棚", "minimal": "极简",
	"fresh": "清新", "technology": "科技", "guochao": "国潮", "handdrawn": "手绘插画",
}

var promptLanguageLabels = map[string]string{
	"none": "不新增文字（保留商品原有包装文字）", "zh-CN": "中文（简体）", "zh-TW": "中文（繁体）",
	"en": "英文", "ja": "日语", "ko": "韩文", "th": "泰语",
	"ms": "马来语", "id": "印尼语", "ru": "俄语",
}

var promptRecreateLabels = map[string]string{"style": "参考风格", "high": "高度复刻"}

var promptRetouchLabels = map[string]string{
	"gloss": "增强产品光泽", "repair": "修复划痕瑕疵", "clarity": "提升整体清晰度",
	"color": "色彩校正", "perspective": "修正透视变形", "background": "背景净化",
}

func labeledValue(labels map[string]string, raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if label, ok := labels[value]; ok {
		return label
	}
	return value
}

// buildPromptUserText 把用户输入与当前配置拼成给模型的用户消息。
func buildPromptUserText(target, text string, r *http.Request, prompts ...generationPromptSet) string {
	var builder strings.Builder
	if target == "requirements" {
		builder.WriteString("请结合下面的配置，输出一段可直接用于生成商品图的提示词。\n")
	} else {
		builder.WriteString("请在保留原意的前提下，按需优化下面的图像创作描述。配置仅用于约束改写，不要把配置说明抄进结果。\n")
		writeGeneralPromptContext(&builder, text, r, prompts...)
		if text == "" {
			builder.WriteString("用户没有输入文字，请直接输出针对上传图片的优化指令。")
		} else {
			writePromptInput(&builder, text)
		}
		return builder.String()
	}

	writeContextLine(&builder, "任务类型", labeledValue(promptTaskTypeLabels, r.FormValue("taskType")))
	writeContextLine(&builder, "目标平台", labeledValue(promptPlatformLabels, r.FormValue("platform")))
	writeContextLine(&builder, "模块组合", moduleContextText(r, prompts...))
	writeContextLine(&builder, "期望风格", labeledValue(promptStyleLabels, r.FormValue("style")))
	writeContextLine(&builder, "文字语言", labeledValue(promptLanguageLabels, r.FormValue("outputLanguage")))
	writeContextLine(&builder, "复刻程度", labeledValue(promptRecreateLabels, r.FormValue("recreateStrength")))

	if enhancements := r.MultipartForm.Value["enhancements"]; len(enhancements) > 0 {
		labels := make([]string, 0, len(enhancements))
		for _, item := range enhancements {
			if label := promptRetouchLabels[strings.TrimSpace(item)]; label != "" {
				labels = append(labels, label)
			}
		}
		writeContextLine(&builder, "精修要求", strings.Join(labels, "、"))
	}

	writePromptInput(&builder, text)
	return builder.String()
}

// Use the same saved style and reference instructions as the image request.
func writeGeneralPromptContext(builder *strings.Builder, text string, r *http.Request, prompts ...generationPromptSet) {
	templates := generationDefaults
	if len(prompts) > 0 {
		templates = prompts[0]
	}
	style := strings.TrimSpace(r.FormValue("style"))
	if style != "unspecified" && promptStyleLabels[style] != "" {
		writeContextLine(builder, "期望风格", templates["image.style."+style])
	}
	if len(r.MultipartForm.File["images"]) == 0 && r.FormValue("imagesSources") == "" {
		return
	}
	if text == "" {
		writeContextLine(builder, "本次任务", "基于上传图片做克制的视觉优化。保留主体与关键关系，按期望风格处理，未指定风格时沿用原有风格；选择一至三项适合该图的具体改进，输出可直接用于生图的修改指令，不逐项复述原图内容，不虚构瑕疵")
	} else {
		writeContextLine(builder, "本次任务", "以用户文字中的创作或修改目标为准，结合图片把目标变成具体指令，并说明必要的保留项。图片用于理解现状，不逐项复述原图；用户明确要求还原或提取提示词时才按画面还原处理")
	}
	strength := strings.TrimSpace(r.FormValue("referenceStrength"))
	switch strength {
	case "low", "medium", "high":
	default:
		strength = "medium"
	}
	writeContextLine(builder, "参考要求", templates["image.reference."+strength])
}

func writePromptInput(builder *strings.Builder, text string) {
	if text != "" {
		builder.WriteString("用户输入：\n" + text)
	} else {
		builder.WriteString("用户没有输入文字，请根据上传的图片完成上面的任务。")
	}
}

func writeContextLine(builder *strings.Builder, label, value string) {
	if value == "" {
		return
	}
	builder.WriteString(label + "：" + value + "\n")
}

const (
	maxContextModules     = 16
	maxContextModuleRunes = 32
	maxContextCountRunes  = 8
)

// moduleContextText 把前端选择的模块拼成中文说明，例如
// 「自定义模块：首屏主视觉×1（突出商品主体与品牌调性，构图干净居中）、核心卖点图×2（围绕核心卖点构图…）」。
// modules 是「中文名×数量」（后端不认识也能正常显示），moduleKeys 是并行的「key×数量」，
// 用来补上与生成时同源的模块表达要点，让模型知道每个模块各自要表达什么。
// 比例、分辨率这类输出规格不参与提示词生成。
func moduleContextText(r *http.Request, prompts ...generationPromptSet) string {
	mode := strings.TrimSpace(r.FormValue("moduleMode"))
	labels := r.MultipartForm.Value["modules"]
	keys := r.MultipartForm.Value["moduleKeys"]
	entries := make([]string, 0, len(labels))
	for index, item := range labels {
		if len(entries) >= maxContextModules {
			break
		}
		label, count := splitNameCount(item)
		if label == "" {
			continue
		}
		entry := label
		if count != "" {
			entry += "×" + count
		}
		if index < len(keys) {
			if key, _ := splitNameCount(keys[index]); key != "" {
				if intent := moduleIntent(strings.TrimSpace(r.FormValue("taskType")), key, prompts...); intent != "" {
					entry += "（" + intent + "）"
				}
			}
		}
		entries = append(entries, entry)
	}
	if len(entries) == 0 {
		if mode == "smart" {
			return "由 AI 依据商品与平台自动组合模块"
		}
		return ""
	}
	if mode == "custom" {
		return "自定义模块：" + strings.Join(entries, "、")
	}
	return strings.Join(entries, "、")
}

// splitNameCount 解析「名称×数量」，没有数量时只返回名称。
func splitNameCount(item string) (name, count string) {
	parts := strings.SplitN(strings.TrimSpace(item), "×", 2)
	name = clipRunes(parts[0], maxContextModuleRunes)
	if len(parts) == 2 {
		count = clipRunes(parts[1], maxContextCountRunes)
	}
	return name, count
}

// moduleIntent 取模块的表达要点（去掉开头的模块名，只保留要表达的内容），
// 与生成阶段注入的 moduleHint 同源，保证「AI 帮写」和真正出图的目标一致。
func moduleIntent(taskType, key string, prompts ...generationPromptSet) string {
	input := map[string]any{}
	if len(prompts) > 0 {
		input["generationPrompts"] = prompts[0]
	}
	hint := strings.TrimSpace(configuredModuleHint(input, taskType, strings.TrimSpace(key)))
	if hint == "" {
		return ""
	}
	if index := strings.Index(hint, "，"); index >= 0 {
		return strings.TrimSpace(hint[index+len("，"):])
	}
	return hint
}

func clipRunes(value string, limit int) string {
	trimmed := strings.TrimSpace(value)
	if runes := []rune(trimmed); len(runes) > limit {
		return string(runes[:limit])
	}
	return trimmed
}

type promptImageError string

func (e promptImageError) Error() string { return string(e) }

const (
	errPromptImageTooLarge   = promptImageError("单张图片不能超过 5MB，请压缩后再试")
	errPromptImageUnreadable = promptImageError("图片读取失败，请重新上传")
)

// Only expose actionable categories, never raw provider messages or credentials.
func promptEnhanceError(err error) (int, string, string) {
	if errors.Is(err, context.DeadlineExceeded) {
		return http.StatusGatewayTimeout, "PROMPT_ENHANCE_TIMEOUT", "AI 响应超时，原文已保留，请稍后重试"
	}
	var upstream *promptUpstreamError
	if errors.As(err, &upstream) {
		switch {
		case upstream.status == http.StatusTooManyRequests:
			return http.StatusTooManyRequests, "PROMPT_ENHANCE_BUSY", "AI 服务繁忙或额度不足，请稍后重试，或在设置中检查服务额度"
		case upstream.status == http.StatusUnauthorized || upstream.status == http.StatusForbidden:
			return http.StatusServiceUnavailable, "PROMPT_AI_AUTH_FAILED", "提示词 AI 服务授权失败，请在设置中检查 API 密钥和模型权限"
		case upstream.kind == "length":
			return http.StatusBadGateway, "PROMPT_ENHANCE_TRUNCATED", "AI 输出未完成，原文已保留，请精简描述后重试"
		case upstream.kind == "filter":
			return http.StatusBadRequest, "PROMPT_ENHANCE_FILTERED", "AI 未能处理当前内容，请调整文字或参考图后重试"
		case upstream.status == http.StatusBadRequest || upstream.status == http.StatusNotFound || upstream.status == http.StatusUnprocessableEntity:
			return http.StatusBadGateway, "PROMPT_AI_CONFIG_INVALID", "提示词模型未接受请求，请检查设置中的模型、接口地址和图片识别能力"
		}
	}
	return http.StatusBadGateway, "PROMPT_ENHANCE_FAILED", "AI 服务暂时未返回有效结果，原文已保留，请稍后重试"
}
