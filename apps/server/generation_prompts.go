package main

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// A snapshot is loaded once per job so all images in a group use the same settings.
type generationPromptSet map[string]string

func generationPromptDefinitions() []promptTemplate {
	list := []promptTemplate{
		{Key: "image.commerce.common", Name: "电商通用生成要求", Category: "commerce", Content: "商品原图是商品外观的唯一依据，保留真实形状、长宽比例、颜色、部件、包装版式与可见图案，不重新设计商品，不把参考图的商品混入结果。信息仅来自用户明确提供的资料或原图清楚可见的内容，不编造成分、功效、尺寸、认证、销量、价格、评价或配件；看不清的文字保留其原有字形，不猜写。每次只输出一张可使用的独立成片，不输出样张板、分屏对照、九宫格或编辑界面", Description: "所有常规电商图片都会附加，约束商品外观、资料来源与独立成片。"},
		{Key: "image.product-main", Name: "商品主图生成要求", Category: "commerce", Content: "商品主图：单件商品为绝对主角，完整展示顶部、底部和左右轮廓，主体清晰且四周留必要边距，画面克制，背景不抢主体", Description: "直接影响商品主图成片，不需要配置 Prompt AI。"},
		{Key: "image.detail-page", Name: "商品详情生成要求", Category: "commerce", Content: "商品详情：按当前模块组织清晰的信息层次，主体与说明分区排列，标题、副标题和商品之间留白，避免夸张花字、过多装饰和文字堆叠；资料不足时优先展示外观与已知信息", Description: "直接影响商品详情成片，不需要配置 Prompt AI。"},
		{Key: "image.product-retouch", Name: "产品精修生成要求", Category: "commerce", Content: "产品精修采用原图局部编辑，保持原有机位、构图、商品大小与包装，只有用户指定的透视校正或换底可以改变对应部分。用户未要求时不增加绿植、摆件、装饰道具或新的场景，不把精修变为重新拍摄的广告图", Description: "直接影响产品精修成片，不需要配置 Prompt AI。"},
		{Key: "image.recreate.high", Name: "爆款复刻 · 高度复刻", Category: "commerce", Content: "高度复刻参考图的视觉结构：尽量匹配商品位置、视角、背景、光向、留白与层次，但按真实商品形状适配构图，不为了贴合参考而拉伸商品。完全移除参考图的原商品、Logo和文案", Description: "用于对应复刻程度，商品外观仍由商品原图提供。"},
		{Key: "image.recreate.style", Name: "爆款复刻 · 参考风格", Category: "commerce", Content: "参考风格：只借鉴配色、氛围和布光，围绕商品重新安排适合其形状的构图，不复制参考图的主体、品牌、文字或复杂摆件", Description: "用于对应复刻程度，商品外观仍由商品原图提供。"},
		{Key: "image.product-main.smart", Name: "主图智能组合", Category: "commerce", Content: "智能模式默认制作干净的商品首图，不拼接整套图片", Description: "未选择自定义模块时附加。"},
		{Key: "image.detail-page.smart", Name: "详情智能组合", Category: "commerce", Content: "智能模式默认生成一张详情首屏概览，突出商品和少量已知信息，不在一张图里塞入整套详情模块", Description: "未选择自定义模块时附加。"},
		{Key: "image.text.none", Name: "不新增画面文字", Category: "commerce", Content: "不新增营销文案、字母或数字；必须保留商品原图中已有的包装文字、品牌名、Logo、型号和商标，不要删除、替换、翻译或重写", Description: "选择不新增文字时使用；产品精修也使用此规则。"},
		{Key: "image.text.language", Name: "新增画面文字", Category: "commerce", Content: "必须保留商品原图中已有的包装文字、品牌名、Logo、型号和商标，不要删除、替换、翻译或重写；如需新增文字，仅使用{{language}}，文案只来自用户明确提供或原图清楚可见的信息。用户指定标题和副标题时逐字使用，不额外扩写；文字与商品分区排版，不覆盖主体或包装标签", Description: "选择画面文字语言时使用，语言按本次参数填入。", Variables: []string{"language"}},
		{Key: "image.reference.low", Name: "参考强度 · 低", Category: "general", Content: "参考图片仅提供轻度视觉启发，以文字描述为主", Description: "通用生图上传参考图片后，根据所选参考强度附加。"},
		{Key: "image.reference.medium", Name: "参考强度 · 中", Category: "general", Content: "遵循文字描述，适度参考图片的视觉特征", Description: "通用生图上传参考图片后，根据所选参考强度附加。"},
		{Key: "image.reference.high", Name: "参考强度 · 高", Category: "general", Content: "在遵循文字描述的前提下，尽量保持参考图片中要求保留的视觉特征", Description: "通用生图上传参考图片后，根据所选参考强度附加。"},
		{Key: "image.style.studio", Name: "创作风格 · 摄影棚", Category: "general", Content: "创作风格：摄影棚", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.minimal", Name: "创作风格 · 极简", Category: "general", Content: "创作风格：极简", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.fresh", Name: "创作风格 · 清新", Category: "general", Content: "创作风格：清新", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.technology", Name: "创作风格 · 科技", Category: "general", Content: "创作风格：科技", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.guochao", Name: "创作风格 · 国潮", Category: "general", Content: "创作风格：国潮", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.handdrawn", Name: "创作风格 · 手绘插画", Category: "general", Content: "创作风格：手绘插画", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "general.format", Name: "本地提示词整理", Category: "general", Content: "{{prompt}}。\n画面要求：主体清晰完整，构图平衡，留白充足，无杂乱元素。\n光线与质感：柔和自然光，材质与细节清晰，高级商业质感。\n{{style}}\n输出要求：高分辨率，真实可信，不添加未指定的文字与 Logo。", Description: "未配置 Prompt AI 时整理通用描述或电商需求，只处理文字，不调用 AI 服务。", Variables: []string{"prompt", "style"}},
		{Key: "module.product-main.hero", Name: "主图 · 主图首图", Category: "module", Content: "主视觉首图，突出商品主体与品牌调性，构图干净居中", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.white", Name: "主图 · 白底主图", Category: "module", Content: "纯白底主图，背景为均匀纯白 RGB 255,255,255，仅展示商品，商品完整居中且四周保留安全边距，均匀柔光和自然接触阴影，不出现道具、边框或额外文字", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.selling", Name: "主图 · 卖点主图", Category: "module", Content: "卖点主图，围绕核心卖点构图，画面有清晰的信息层次", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.scene", Name: "主图 · 场景主图", Category: "module", Content: "场景应用图，商品置于真实使用场景中，氛围自然", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.detail", Name: "主图 · 细节主图", Category: "module", Content: "产品细节图，近景特写材质与工艺细节", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.hero", Name: "详情 · 首屏主视觉", Category: "module", Content: "详情首屏主视觉，商品完整清晰，标题与商品分区排版，用留白建立阅读层次，每张都是独立模块", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.selling", Name: "详情 · 核心卖点图", Category: "module", Content: "卖点详情图，突出一个已知特点，用商品外观与简洁排版说明，仅使用已提供的商品信息，不以想象的原料、成分、功效或认证作证明", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.scene", Name: "详情 · 场景应用图", Category: "module", Content: "场景应用图，商品置于真实使用场景中，氛围自然", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.detail", Name: "详情 · 产品细节图", Category: "module", Content: "产品细节图，近景特写材质与工艺细节", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.spec", Name: "详情 · 规格参数图", Category: "module", Content: "规格参数图，只排版用户提供或原图清楚可读的规格；缺少参数时展示商品外观，不编造尺寸、容量或数值，不绘制虚假的测量标注", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.feedback", Name: "详情 · 用户反馈图", Category: "module", Content: "用户反馈图，只使用用户提供的真实评价；未提供评价时展示中性的使用场景，不生成评价引语、星级、销量或用户身份", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.package", Name: "详情 · 包装内容图", Category: "module", Content: "包装内容图，只展示原图可见或用户明确列出的包装和配件，不凭空添加赠品或套装", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.brand", Name: "详情 · 品牌故事图", Category: "module", Content: "品牌故事图，传达品牌调性与生活方式", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.certificate", Name: "详情 · 品质认证图", Category: "module", Content: "品质认证图，仅在用户提供认证资料时展示相应认证；资料不足时改为商品工艺展示，不生成认证标识、证书编号或检测结论", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.install", Name: "详情 · 安装指引图", Category: "module", Content: "安装指引图，分步骤清晰展示安装过程", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.faq", Name: "详情 · 常见问题图", Category: "module", Content: "常见问题图，以画面解答用户疑虑", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.size", Name: "详情 · 尺码对照图", Category: "module", Content: "尺码对照图，只使用用户提供的真实尺码数据；未提供数据时展示版型与比例，不生成尺码表或测量数字", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.material", Name: "详情 · 材质纹理图", Category: "module", Content: "材质纹理图，特写材质质感与用料", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.promotion", Name: "详情 · 结尾促销图", Category: "module", Content: "结尾促销图，只使用用户明确提供的价格、优惠和期限；缺少促销资料时展示商品收尾主视觉，不生成折扣、倒计时或虚构优惠", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "retouch.gloss", Name: "精修 · 增强光泽", Category: "retouch", Content: "增强产品光泽与质感，只调整与真实材质相符的柔和反光，不将哑光改为镜面，不覆盖包装文字", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.repair", Name: "精修 · 修复瑕疵", Category: "retouch", Content: "修复划痕与瑕疵，只清理拍摄污点和偶发损伤，保留真实接缝、印刷纹理与结构", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.clarity", Name: "精修 · 提升清晰度", Category: "retouch", Content: "提升整体清晰度，克制降噪和锐化，不重新绘制文字与图案，不产生锐化白边", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.color", Name: "精修 · 色彩校正", Category: "retouch", Content: "校正色彩，只修正偏色和曝光，以商品原图颜色为准，不改变商品配色", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.perspective", Name: "精修 · 透视校正", Category: "retouch", Content: "修正透视变形，保留商品真实长宽比例和部件关系，不拉伸或重新设计外形", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.background", Name: "精修 · 背景净化", Category: "retouch", Content: "净化背景，清理原有杂物后保持背景材质与场景逻辑；用户明确要求换底时才替换，不新增绿植、摆件或装饰道具", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.basic", Name: "未选精修项的基础处理", Category: "retouch", Content: "基础精修只做轻度曝光、偏色、降噪与清晰度调整，保留真实材质和拍摄场景", Description: "没有勾选任何精修项时使用。"},
		{Key: "image.clothing.common", Name: "服装通用要求", Category: "clothing", Content: "服装电商摄影，每次只生成一张独立成片。服装原图是商品外观的唯一依据，必须保留真实颜色、版型、印花、Logo、纽扣和缝线，不替换款式，不新增配件或虚构面料成分、尺码、性能、价格和认证。不可见的结构、印花、标签与工艺不作具体臆造；背面素材不足时采用保守展示。整组采用统一光线、色温与背景逻辑。", Description: "直接用于服装生图；用户确认的逐张拍摄要求仍会附加。"},
		{Key: "image.clothing.model", Name: "模特上身要求", Category: "clothing", Content: "模特穿着全部服装原图所组成的同套搭配。模特参考仅用于保持人物身份、脸部和体型，不复制模特原有衣服。保留脸型、发型、发色、眼镜与可见年龄特征，不美化成另一个人。场景参考仅用于背景，不复制其中的人物或服装。衣服自然贴合人体，印花随面料弯曲但保持原有图形结构；手臂不遮挡关键图案。取景遵循用户规划与模特照片可见的身体范围，穿着结构与人体比例自然合理。", Description: "直接用于服装生图；用户确认的逐张拍摄要求仍会附加。"},
		{Key: "image.clothing.product", Name: "服装商品图要求", Category: "clothing", Content: "各张服装原图是同一件服装的不同视角，请保持同一件商品。服装原图中的人体只用于说明穿着状态，不能复制到正面、背面或立体商品图中。正面、背面、立体与人台图必须完整展示领口、两侧袖口与下摆，四周保留至少约 6% 安全边距，衣服不能贴边或被裁断；只有细节特写允许局部取景。", Description: "直接用于服装生图；用户确认的逐张拍摄要求仍会附加。"},
		{Key: "image.clothing.print", Name: "服装印花与轮廓", Category: "clothing", Content: "把印花和 Logo 视为原图的完整图形保留，保留其字形、线条、位置与相对比例，不重新排字或重新设计标志，不因提高清晰度而猜写微小文字。白色摄影棚背景保持干净，柔和接触阴影，避免衣服轮廓融入背景。", Description: "直接用于服装生图；用户确认的逐张拍摄要求仍会附加。"},
		{Key: "clothing.style.studio", Name: "拍摄风格 · 摄影棚", Category: "clothing", Content: "摄影棚柔和均匀布光", Description: "选择此服装拍摄风格后附加。"},
		{Key: "clothing.style.natural", Name: "拍摄风格 · 自然生活", Category: "clothing", Content: "自然生活场景与自然光", Description: "选择此服装拍摄风格后附加。"},
		{Key: "clothing.style.street", Name: "拍摄风格 · 街拍", Category: "clothing", Content: "真实街拍光线与环境", Description: "选择此服装拍摄风格后附加。"},
		{Key: "clothing.style.editorial", Name: "拍摄风格 · 品牌画报", Category: "clothing", Content: "品牌画报，克制的时尚构图", Description: "选择此服装拍摄风格后附加。"},
		{Key: "module.clothing-set.clothing-front", Name: "服装 · 正面精修", Category: "clothing", Content: "完整展示服装正面，干净背景，自然均匀光线，保持服装真实颜色、版型、印花与 Logo", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "module.clothing-set.clothing-back", Name: "服装 · 背面精修", Category: "clothing", Content: "展示服装背面结构，依据背面原图，不臆造不可见的图案、标签与工艺", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "module.clothing-set.clothing-3d", Name: "服装 · 立体展示", Category: "clothing", Content: "生成白底的服装静态立体效果图，展示真实廓形、垂坠和厚度，不出现人体或杂物", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "module.clothing-set.clothing-mannequin", Name: "服装 · 人台展示", Category: "clothing", Content: "服装穿在人台上，白底摄影，展示版型与垂坠；人台不是人物模特", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "module.clothing-set.clothing-detail", Name: "服装 · 细节特写", Category: "clothing", Content: "近景展示原图可见的面料纹理、领口、袖口、缝线或印花工艺，保持真实细节", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "module.clothing-set.clothing-selling", Name: "服装 · 卖点图", Category: "clothing", Content: "根据用户提供或图片可见的服装特点制作卖点图，不编造面料成分、尺码、性能、价格或认证", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "module.clothing-set.clothing-model", Name: "服装 · 模特上身", Category: "clothing", Content: "由上传模特穿着用户提供的同套服装，保留模特身份与服装外观，穿着结构自然合理", Description: "用于服装图片图种和 AI 拍摄规划，逐张规划可另行编辑。"},
		{Key: "clothing.plan", Name: "服装 AI 拍摄规划", Category: "clothing", Content: "你是服装电商摄影策划。依据用户图片完善拍摄规划。描述每张图的拍摄视角、背景、光线与服装细节，每张都是独立成片。严格保留服装颜色、版型、印花、Logo 与工艺；模特参考仅用于人物身份，场景参考仅用于背景。只描述可见特征，不猜测面料成分、尺码、性能或认证；不可见的背面结构需说明。", Description: "用于 AI 识图分析和规划；返回字段、图种顺序与张数由系统固定。"},
	}
	poses := []string{"正面自然站姿，完整展示所选服装，取景与模特照片可见范围匹配", "侧面站姿，展示服装廓形与垂坠", "自然行走姿态，服装清晰完整", "场景全身照，保持同一模特与穿搭"}
	for index, content := range poses {
		list = append(list, promptTemplate{Key: fmt.Sprintf("clothing.pose.%d", index+1), Name: fmt.Sprintf("模特默认姿态 · 第 %d 张", index+1), Category: "clothing", Content: content, Description: "用于手动规划及 AI 分析的初始规划，确认前可逐张编辑。"})
	}
	list = append(list, promptTemplate{Key: "clothing.plan.footer", Name: "逐张规划通用要求", Category: "clothing", Content: "保留原图服装颜色、款式、印花与 Logo，采用统一光线与背景。", Description: "附加到初始拍摄规划，确认前可逐张编辑。"})
	return list
}

var generationDefaults = func() generationPromptSet {
	result := generationPromptSet{}
	for _, template := range generationPromptDefinitions() {
		result[template.Key] = template.Content
	}
	return result
}()

func promptSet(templates []promptTemplate) generationPromptSet {
	result := generationPromptSet{}
	for key, content := range generationDefaults {
		result[key] = content
	}
	for _, template := range templates {
		if template.Enabled {
			result[template.Key] = template.Content
		} else {
			result[template.Key] = ""
		}
	}
	return result
}

func (s *server) promptSnapshot() ([]promptTemplate, error) {
	if s.ai == nil {
		return defaultPromptTemplates(), nil
	}
	var templates []promptTemplate
	err := s.ai.withConfig(false, func(state *aiConfiguration) error { templates = state.Templates; return nil })
	return templates, err
}

func (s *server) generationPromptSnapshot() (generationPromptSet, error) {
	templates, err := s.promptSnapshot()
	return promptSet(templates), err
}

func generationText(input map[string]any, key string) string {
	if templates, ok := input["generationPrompts"].(generationPromptSet); ok {
		return templates[key]
	}
	return generationDefaults[key]
}

func renderPrompt(content string, values map[string]string) string {
	pairs := make([]string, 0, len(values)*2)
	for key, value := range values {
		pairs = append(pairs, "{{"+key+"}}", value)
	}
	return strings.NewReplacer(pairs...).Replace(content)
}

func configuredModuleHint(input map[string]any, taskType, key string) string {
	if taskType == "" {
		taskType = "product-main"
	}
	return generationText(input, "module."+taskType+"."+key)
}

func joinPromptParts(parts []string, separator string) string {
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if text := strings.TrimSpace(part); text != "" {
			result = append(result, text)
		}
	}
	return strings.Join(result, separator)
}

const clothingPlanOutputContract = `只返回 JSON，字段为 summary、warnings、shots；每个 shot 必须原样保留 id 和 moduleKey，可以完善 label 与 description。不得改变顺序、图种或张数。summary 最多 1200 字，warnings 最多 8 项，每项最多 300 字，每张 description 最多 2000 字。`

var promptVariablesPattern = regexp.MustCompile(`\{\{([^{}]+)\}\}`)

func validateTemplateVariables(template promptTemplate, content string) error {
	variables := templateMetadata(template).Variables
	if len(variables) == 0 {
		return nil
	}
	supported := map[string]bool{}
	for _, variable := range variables {
		supported[variable] = true
	}
	for _, match := range promptVariablesPattern.FindAllStringSubmatch(content, -1) {
		if !supported[match[1]] {
			return fmt.Errorf("此模板不支持变量 %s，请使用用途说明中列出的变量", match[0])
		}
	}
	return nil
}

func templateMetadata(template promptTemplate) promptTemplate {
	for _, def := range defaultPromptTemplates() {
		if def.Key == template.Key {
			template.Name = def.Name
			template.Category = def.Category
			template.Description = def.Description
			template.Variables = def.Variables
			break
		}
	}
	return template
}

// Local formatting uses saved settings but never invokes a paid AI client.
func (s *server) formatPrompt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.error(w, 405, "METHOD_NOT_ALLOWED", "不支持的请求方法")
		return
	}
	if _, ok := s.authenticatedUserID(r); !ok {
		s.error(w, 401, "AUTH_REQUIRED", "请先登录")
		return
	}
	var input struct {
		Text  string `json:"text"`
		Style string `json:"style"`
	}
	if !decode(r, &input) || strings.TrimSpace(input.Text) == "" || len([]rune(input.Text)) > 10000 {
		s.error(w, 400, "PROMPT_INPUT_INVALID", "请输入 1–10000 个字符的描述")
		return
	}
	templates, err := s.generationPromptSnapshot()
	if err != nil {
		s.error(w, 500, "PROMPT_STORAGE_ERROR", "提示词配置读取失败")
		return
	}
	original := strings.TrimRight(strings.TrimSpace(input.Text), "。；;，, ")
	if original == "" {
		s.error(w, 400, "PROMPT_INPUT_INVALID", "请输入有效的画面描述")
		return
	}
	content := templates["general.format"]
	result := original
	if content != "" {
		result = strings.TrimSpace(renderPrompt(content, map[string]string{"prompt": original, "style": templates["image.style."+input.Style]}))
	}
	s.json(w, 200, map[string]any{"text": result, "fallback": true})
}
