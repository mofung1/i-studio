package main

import (
	"encoding/base64"
	"io"
	"net/http"
	"strings"
)

const (
	maxPromptImages    = 4
	maxPromptImageSize = 5 << 20  // 单张 5MB
	maxPromptBodySize  = 24 << 20 // 整个请求 24MB
	maxPromptTextRunes = 2000
)

const promptRewriteSystemPrompt = `你是文生图提示词工程师。你的任务是把用户的口语描述（以及可能上传的参考图）改写成一条可直接用于文生图模型的提示词。

要求：
1. 结构顺序固定为：主体与场景 → 构图与视角 → 光线 → 材质与质感 → 风格与氛围 → 输出约束。
2. 保留用户原文中的关键元素、品牌信息与主体特征；不得替换主体，不得新增用户没有提到的产品或文字。
3. 如果用户提供了图片，以图片内容为准补充主体特征（形状、颜色、材质、画面中的文字），不要臆造图片里没有的元素。
4. 不写解释、不写标题、不使用 Markdown、不加引号、不使用列表符号。
5. 使用与用户输入相同的语言；中文输入输出中文。
6. 结合下方给出的期望风格，让描述与该用途保持一致。
7. 长度控制在 1000 字以内；在保证信息完整的前提下尽量精炼。
8. 只输出改写后的提示词本身。`

const requirementSystemPrompt = `你是跨境电商视觉策划，同时也是文生图提示词工程师。请结合用户提供的文字、商品图片，以及当前任务类型、目标平台、模块组合、文字语言等参数，直接输出一段完整、可以拿去生成商品图的提示词。

要求：
1. 输出一段连续的文字：不要分行、不要写字段名或标题、不要使用 Markdown、不要加引号、不要用列表符号。
2. 内容顺序自然融入：商品主体与外包装特征 → 场景与环境 → 构图与视角 → 光线 → 材质与质感 → 风格与氛围 → 输出约束。
3. 图片里能直接看到的信息（外形、颜色、材质、包装文字与图案、原场景）优先采用；用户写的文字优先于推断。
4. 包装上原有的文字与 logo 必须保留并写清，不要改写、也不要杜撰新的文案。
5. 图片和文字都没有提到的软信息（目标人群、使用场景、氛围、道具搭配、构图方式）可按品类常识合理推断，并写成明确方案。
6. 结合目标平台的常见商品图习惯安排构图、留白与背景，让画面符合该平台的主流审美（不要编造平台硬性规范）。
7. 画面文字严格遵从「文字语言」参数；若要求不新增文字，则只保留商品原有包装文字。
8. 若给出了复刻程度或精修项，请把它们落实成具体的画面表述。
9. 严禁编造硬性事实：容量、功率、成分含量、认证与编号、销量、价格、品牌历史、获奖信息一律不写。
10. 使用与用户输入相同的语言；中文输入输出中文。
11. 长度控制在 1000 字以内；在保证信息完整的前提下尽量精炼。
12. 只输出这段提示词本身。`

// promptTaskGuidance 按任务类型追加一段说明：不同板块要表达的重点不同，
// 否则详情页很容易拿到一段与自身无关的主图式提示词。
var promptTaskGuidance = map[string]string{
	"product-main":    "本次任务是商品主图：画面要一眼看清商品本体与核心卖点，主体完整、背景干净、留白合理。",
	"detail-page":     "本次任务是电商详情页素材，会按模块成套产出（例如首屏主视觉、核心卖点图、场景应用图、产品细节图、规格参数图等）。请围绕商品本身与卖点展开，覆盖这些模块共同需要的商品信息：外观与包装、材质质感、使用场景、可展示的细节；不要只写成单张主图式的画面。",
	"viral-recreate":  "本次任务是爆款复刻：商品本体以用户上传的原图为准，可以借鉴参考图的视觉结构与氛围，不要照搬参考图中的其他商品。",
	"product-retouch": "本次任务是产品精修：以商品原图的真实外观为基准，只做质感、清晰度、背景与色彩上的提升，不改变商品形状、颜色与包装信息。",
}

// promptSystem 选择系统提示词，并按任务类型补上对应板块的表达重点。
func promptSystem(target, taskType string) string {
	base := promptRewriteSystemPrompt
	if target == "requirements" {
		base = requirementSystemPrompt
	}
	if guidance := promptTaskGuidance[strings.TrimSpace(taskType)]; guidance != "" {
		return base + "\n\n" + guidance
	}
	return base
}

// promptEnhance 处理「AI 优化提示词 / AI 帮写」：文本或图片至少有一个才受理。
func (s *server) promptEnhance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.error(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if _, ok := s.authenticatedUserID(r); !ok {
		s.error(w, http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		return
	}
	if s.promptClient == nil {
		s.error(w, http.StatusServiceUnavailable, "PROMPT_AI_UNAVAILABLE", "AI 文本服务尚未配置，请在后端设置 DEEPSEEK_API_KEY")
		return
	}

	if err := r.ParseMultipartForm(maxPromptBodySize); err != nil {
		s.error(w, http.StatusBadRequest, "PROMPT_INPUT_INVALID", "请求内容无法解析，请重试")
		return
	}

	target := strings.TrimSpace(r.FormValue("target"))
	text := strings.TrimSpace(r.FormValue("text"))
	if len([]rune(text)) > maxPromptTextRunes {
		s.error(w, http.StatusBadRequest, "PROMPT_INPUT_TOO_LONG", "输入内容过长，请精简后再试")
		return
	}

	images, err := readPromptImages(r)
	if err != nil {
		s.error(w, http.StatusBadRequest, "PROMPT_IMAGE_INVALID", err.Error())
		return
	}
	// 图片或文本必须至少有一个
	if text == "" && len(images) == 0 {
		s.error(w, http.StatusBadRequest, "PROMPT_INPUT_EMPTY", "请先上传图片或输入文字")
		return
	}

	system := promptSystem(target, r.FormValue("taskType"))
	userText := buildPromptUserText(target, text, r)

	rewritten, err := s.promptClient.complete(r.Context(), system, userText, images, 800)
	if err != nil {
		s.error(w, http.StatusBadGateway, "PROMPT_ENHANCE_FAILED", "AI 处理失败，请稍后重试")
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

func readPromptImages(r *http.Request) ([]promptImage, error) {
	files := r.MultipartForm.File["images"]
	if len(files) > maxPromptImages {
		files = files[:maxPromptImages]
	}
	images := make([]promptImage, 0, len(files))
	for _, header := range files {
		if header.Size > maxPromptImageSize {
			return nil, errPromptImageTooLarge
		}
		file, err := header.Open()
		if err != nil {
			return nil, errPromptImageUnreadable
		}
		data, err := io.ReadAll(io.LimitReader(file, maxPromptImageSize+1))
		_ = file.Close()
		if err != nil || len(data) == 0 {
			return nil, errPromptImageUnreadable
		}
		if len(data) > maxPromptImageSize {
			return nil, errPromptImageTooLarge
		}
		images = append(images, promptImage{Mime: promptImageMime(header.Header.Get("Content-Type")), Data: base64.StdEncoding.EncodeToString(data)})
	}
	return images, nil
}

// promptImageMime 只接受模型支持、且上传区允许的几种格式。
func promptImageMime(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0])) {
	case "image/png":
		return "image/png"
	case "image/webp":
		return "image/webp"
	case "image/gif":
		return "image/gif"
	default:
		return "image/jpeg"
	}
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
	"fresh": "清新", "technology": "科技", "guochao": "国潮",
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
func buildPromptUserText(target, text string, r *http.Request) string {
	var builder strings.Builder
	if target == "requirements" {
		builder.WriteString("请结合下面的配置，输出一段可直接用于生成商品图的提示词。\n")
	} else {
		builder.WriteString("请结合下面的配置，把描述改写为一条文生图提示词。\n")
	}

	writeContextLine(&builder, "任务类型", labeledValue(promptTaskTypeLabels, r.FormValue("taskType")))
	writeContextLine(&builder, "目标平台", labeledValue(promptPlatformLabels, r.FormValue("platform")))
	writeContextLine(&builder, "模块组合", moduleContextText(r))
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

	if text != "" {
		builder.WriteString("用户输入：\n" + text)
	} else {
		builder.WriteString("用户没有输入文字，请根据上传的图片完成上面的任务。")
	}
	return builder.String()
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
)

// moduleContextText 把前端选择的模块拼成中文说明，例如「自定义模块：首屏主视觉×1、核心卖点图×2」。
// 比例、分辨率这类输出规格不参与提示词生成，这里只带真正影响内容的业务上下文。
func moduleContextText(r *http.Request) string {
	mode := strings.TrimSpace(r.FormValue("moduleMode"))
	items := r.MultipartForm.Value["modules"]
	labels := make([]string, 0, len(items))
	for _, item := range items {
		if len(labels) >= maxContextModules {
			break
		}
		label := strings.TrimSpace(item)
		if label == "" {
			continue
		}
		if runes := []rune(label); len(runes) > maxContextModuleRunes {
			label = string(runes[:maxContextModuleRunes])
		}
		labels = append(labels, label)
	}
	if len(labels) == 0 {
		if mode == "smart" {
			return "由 AI 依据商品与平台自动组合模块"
		}
		return ""
	}
	if mode == "custom" {
		return "自定义模块：" + strings.Join(labels, "、")
	}
	return strings.Join(labels, "、")
}

type promptImageError string

func (e promptImageError) Error() string { return string(e) }

const (
	errPromptImageTooLarge   = promptImageError("单张图片不能超过 5MB，请压缩后再试")
	errPromptImageUnreadable = promptImageError("图片读取失败，请重新上传")
)
