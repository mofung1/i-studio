package studio

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
		{Key: "image.commerce.common", Name: "电商通用生成要求", Category: "commerce", Content: "商品原图是商品外观的唯一依据，保留真实形状、长宽比例、颜色、部件、包装版式与可见图案，不重新设计商品，不把参考图的商品混入结果。原图中同时出现的包装盒、配件与赠品属于商品组成，不能当作道具删除或替换。信息仅来自用户明确提供的资料或原图清楚可见的内容，不编造成分、功效、尺寸、认证、销量、价格、评价或配件；看不清的文字保留其原有字形，不猜写。每次只输出一张可使用的独立成片，不输出样张板、分屏对照、九宫格或编辑界面", Description: "所有常规电商图片都会附加，约束商品外观、资料来源与独立成片。"},
		{Key: "image.commerce.consistency", Name: "电商整组一致性", Category: "commerce", Content: "同一任务的多张图片保持统一的光线方向、色温、背景逻辑与商品比例，看起来像同一次拍摄；不因张数、模块或重做改变商品真实颜色、包装版式与可见文字", Description: "商品主图等成套生成时附加，约束整组光线与商品呈现的一致性。"},
		{Key: "image.product-main", Name: "商品主图生成要求", Category: "commerce", Content: "制作商品主图：以单件商品为唯一主角，景别服从本张图种。拍摄整品时保留完整轮廓和四周边距；拍摄细节时取景限定在选定部位，允许其余部分延伸出画框。主体清晰，背景简洁，光线服务于形体与材质表现", Description: "直接影响商品主图成片，不需要配置 Prompt AI。"},
		{Key: "image.detail-page", Name: "商品详情生成要求", Category: "commerce", Content: "整组详情页素材按用户选择的模块顺序逐张生成，本次只生成其中一张，每张只承担一个模块的表达任务。通过构图、光线和景深建立视觉层次，仅展现商品原图或用户资料中可以确认的特征；同一商品在整组中的外观、包装、颜色与可见文字保持一致，光线、色温与背景逻辑统一，像同一次拍摄。每张都是独立成片，不拼贴多方案、过程稿、样张板或多格画布", Description: "直接影响商品详情成片，不需要配置 Prompt AI。"},
		{Key: "image.detail-page.information", Name: "详情信息型模块排版", Category: "commerce", Content: "信息型详情模块先安排信息层级与留白，再放商品图；需要文字时，标题区、内容区与图示区清楚分区，文字不覆盖商品和包装标签。所有参数、评价、认证、步骤、尺码与促销信息只来自用户提供或原图清楚可读的内容，缺失时改用商品展示，不生成占位数字、星级、徽章、倒计时或虚构结论", Description: "规格、卖点、评价、认证、安装、尺码、促销等信息型模块附加。"},
		{Key: "image.detail-page.information.visual", Name: "详情信息型模块无文字方案", Category: "commerce", Content: "本张不新增画面文字，信息型模块改用商品外观、局部特写、组合排列和留白表达信息重点；不生成空白文字框、占位排版、假标签或装饰性字母", Description: "信息型模块选择不新增文字时附加。"},
		{Key: "image.product-retouch", Name: "产品精修生成要求", Category: "commerce", Content: "产品精修是原图局部编辑：以原图中的单个商品为编辑对象，保持原有机位、角度、形状、颜色、包装和画面占比，只有用户指定的透视校正或换底可以改变对应部分。原图若包含多个商品、分屏或前后对照，只选取一个完整商品，去除其余商品和多余背景，不把整张拼图缩进画面；商品保持主导比例，不因清理或扩图而缩小，背景只作衬托。以原图为基础做克制的摄影后期，不增加绿植、摆件、装饰道具或新的场景，不把精修变为重新拍摄的广告图", Description: "直接影响产品精修成片，不需要配置 Prompt AI。"},
		{Key: "image.recreate.high", Name: "爆款复刻 · 高度复刻", Category: "commerce", Content: "高度复刻参考图的视觉结构：尽量匹配商品位置、视角、背景、光向、留白与层次，但按真实商品形状适配构图，不为了贴合参考而拉伸商品。完全移除参考图的原商品、Logo和文案", Description: "用于对应复刻程度，商品外观仍由商品原图提供。"},
		{Key: "image.recreate.style", Name: "爆款复刻 · 参考风格", Category: "commerce", Content: "参考风格：只借鉴配色、氛围和布光，围绕商品重新安排适合其形状的构图，不复制参考图的主体、品牌、文字或复杂摆件", Description: "用于对应复刻程度，商品外观仍由商品原图提供。"},
		{Key: "image.product-main.smart", Name: "主图智能组合", Category: "commerce", Content: "智能模式默认制作干净的商品首图，不拼接整套图片", Description: "未选择自定义模块时附加。"},
		{Key: "image.detail-page.smart", Name: "详情智能组合", Category: "commerce", Content: "智能模式默认生成一张详情首屏概览，突出商品和少量已知信息，不在一张图里塞入整套详情模块", Description: "未选择自定义模块时附加。"},
		{Key: "image.text.none", Name: "不新增画面文字", Category: "commerce", Content: "不新增营销文案、字母或数字；必须保留商品原图中已有的包装文字、品牌名、Logo、型号和商标，不要删除、替换、翻译或重写", Description: "选择不新增文字时使用；产品精修也使用此规则。"},
		{Key: "image.text.language", Name: "新增画面文字", Category: "commerce", Content: "必须保留商品原图中已有的包装文字、品牌名、Logo、型号和商标，不要删除、替换、翻译或重写；如需新增文字，仅使用{{language}}，文案只来自用户明确提供或原图清楚可见的信息。用户指定标题和副标题时逐字使用，不额外扩写；文字与商品分区排版，不覆盖主体或包装标签", Description: "选择画面文字语言时使用，语言按本次参数填入。", Variables: []string{"language"}},
		{Key: "platform.smart", Name: "平台适配 · 智能匹配", Category: "commerce", Content: "适配目标平台：按商品用途与目标市场安排构图、背景和留白，优先让商品本体清楚可辨，不做与商品无关的风格化处理", Description: "选择智能匹配时附加，按商品用途安排平台呈现。"},
		{Key: "platform.taobao", Name: "平台适配 · 淘宝/天猫", Category: "commerce", Content: "适配淘宝/天猫商品图：画面明亮干净，商品占比高，背景简洁不抢主体；卖点和文字克制，不堆叠促销贴纸、边框或平台标识，保持真实商品质感", Description: "目标平台为淘宝或天猫时附加。"},
		{Key: "platform.amazon", Name: "平台适配 · Amazon", Category: "commerce", Content: "适配 Amazon 商品图：白底主图使用均匀纯白背景（RGB 255,255,255），商品及其原包装合计约占画面 85%，仅展示商品及其原包装并保留安全边距，不出现道具、边框或水印；场景、细节与卖点图按本张图种取景，背景保持干净，信息只来自用户资料或商品包装", Description: "目标平台为 Amazon 时附加，主图侧重纯白背景与商品占比。"},
		{Key: "platform.douyin", Name: "平台适配 · 抖音", Category: "commerce", Content: "适配抖音商品图：优先竖版构图，商品占画面主要位置，明暗对比清楚、信息一眼可读；背景与光影有节奏但不过度特效，不用夸张的前后对比或虚假使用效果", Description: "目标平台为抖音时附加，侧重竖版与清晰对比。"},
		{Key: "platform.smart.detail", Name: "详情平台适配 · 智能匹配", Category: "commerce", Content: "详情页按目标平台与商品用途安排构图和信息层级：商品避开画面四边，文字与商品保持安全距离，优先保证商品清楚可辨；不做与商品无关的风格化处理", Description: "详情页选择智能匹配时附加。"},
		{Key: "platform.taobao.detail", Name: "详情平台适配 · 淘宝/天猫", Category: "commerce", Content: "详情页适配淘宝/天猫：竖版长图切片，商品主体清楚，信息层级简洁，文字与商品保持安全距离；不堆叠促销贴纸、边框或平台标识，保持真实商品质感", Description: "详情页目标平台为淘宝或天猫时附加。"},
		{Key: "platform.amazon.detail", Name: "详情平台适配 · Amazon", Category: "commerce", Content: "详情页适配 Amazon：按模块用途取景，不套用白底主图规范；商品完整可辨，价格、促销、评价与星级只在用户明确提供且本张模块需要时出现，其余画面不出现联系方式、二维码或站外引导，信息只来自用户资料或商品包装", Description: "详情页目标平台为 Amazon 时附加，避免套用主图白底规范。"},
		{Key: "platform.douyin.detail", Name: "详情平台适配 · 抖音", Category: "commerce", Content: "详情页适配抖音：优先竖版，商品位于画面主要区域并避开底部文案与界面安全区，明暗对比清楚、信息一眼可读；不用夸张的前后对比或虚假使用效果", Description: "详情页目标平台为抖音时附加。"},
		{Key: "image.reference.low", Name: "参考强度 · 低", Category: "general", Content: "参考图片仅提供轻度视觉启发，以文字描述为主", Description: "通用生图上传参考图片后，根据所选参考强度附加。"},
		{Key: "image.reference.medium", Name: "参考强度 · 中", Category: "general", Content: "遵循文字描述，适度参考图片的视觉特征", Description: "通用生图上传参考图片后，根据所选参考强度附加。"},
		{Key: "image.reference.high", Name: "参考强度 · 高", Category: "general", Content: "在遵循文字描述的前提下，尽量保持参考图片中要求保留的视觉特征", Description: "通用生图上传参考图片后，根据所选参考强度附加。"},
		{Key: "image.general.craft", Name: "通用画面质量要求", Category: "general", Content: "画面要求：主体清晰完整，构图有明确视觉重心，前后层次分明，留白服务于主体，不堆砌无关元素。主体与关键道具以用户描述为准，不自动增加新的主体。光线、材质与细节服从画面媒介：摄影保持可信的光影与真实材质，插画与平面设计保持线条、色块和版式清楚，不混入不适合该媒介的写实光影", Description: "通用生图在用户描述后自动附加，约束构图、光线与媒介表现。"},
		{Key: "image.general.output", Name: "通用输出要求", Category: "general", Content: "每次只输出一张完整独立的画面，主体不被画框裁断，不添加未指定的文字、Logo、水印、边框或拼贴分屏", Description: "通用生图最后附加，确保输出单张成片。"},
		{Key: "image.style.studio", Name: "创作风格 · 摄影棚", Category: "general", Content: "创作风格：摄影棚商业摄影。使用干净背景、可控柔光和自然接触阴影，真实材质与清晰结构优先，画面克制、不堆砌道具", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.minimal", Name: "创作风格 · 极简", Category: "general", Content: "创作风格：极简。大面积留白，构图克制，色彩数量少，主体轮廓清晰，光线柔和均匀，不添加多余装饰", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.fresh", Name: "创作风格 · 清新", Category: "general", Content: "创作风格：清新。明亮通透的自然光，低饱和浅色调，画面轻盈干净，保留真实材质，不甜腻、不堆砌装饰", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.technology", Name: "创作风格 · 科技", Category: "general", Content: "创作风格：科技感。冷色或中性色背景，干净利落的几何线条，边缘光勾勒体积，材质有克制的反光，不添加与主体无关的界面元素", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.guochao", Name: "创作风格 · 国潮", Category: "general", Content: "创作风格：国潮。传统东方元素与现代表现结合，纹样和配色有节制，构图有留白，不堆砌龙纹、祥云等符号", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "image.style.handdrawn", Name: "创作风格 · 手绘插画", Category: "general", Content: "创作风格：手绘插画。可见笔触与手绘线条，色块层次清楚，保留纸张或画材质感，不混入照片级写实光影", Description: "通用生图选择此风格后附加，也供本地提示词整理使用。"},
		{Key: "general.format", Name: "本地提示词整理", Category: "general", Content: "{{prompt}}。\n画面要求：主体清晰完整，构图有明确视觉重心，层次清楚，留白服务于主体。\n光线与质感：光线、材质和细节服从画面媒介，不做空泛的“高级感”堆砌。\n{{style}}\n输出要求：一张完整独立画面，不添加未指定的文字、Logo、水印或边框。", Description: "未配置 Prompt AI 时整理通用描述或电商需求，只处理文字，不调用 AI 服务。", Variables: []string{"prompt", "style"}},
		{Key: "module.product-main.hero", Name: "主图 · 主图首图", Category: "module", Content: "主图首图：商品完整呈现并占画面主要位置，构图干净、有明确视觉重心，背景简洁但有轻微层次；用柔和侧光勾勒轮廓与材质，保留品牌调性，不堆砌道具或装饰", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.white", Name: "主图 · 白底主图", Category: "module", Content: "纯白底主图：背景为均匀纯白 RGB 255,255,255，商品完整居中，商品及其原包装合计占画面约 80–85%；仅展示商品及其原包装，四周保留安全边距，使用均匀柔光和自然接触阴影，不出现道具、边框、倒影或额外文字", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.selling", Name: "主图 · 卖点主图", Category: "module", Content: "卖点主图，围绕核心卖点构图，画面有清晰的信息层次", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.scene", Name: "主图 · 场景主图", Category: "module", Content: "场景应用图：商品置于与用途相符的真实使用场景中，氛围自然，背景与道具退居次要，商品仍是唯一主角；光线与场景衔接自然，不添加原图没有的功能、配件或赠品", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.product-main.detail", Name: "主图 · 细节主图", Category: "module", Content: "产品细节图：从原图选一处清楚可见的边缘、接缝、表面处理或工艺作为唯一焦点。镜头靠近，仅取商品约四分之一到二分之一的范围，让该部位占画面大半，画框切过商品轮廓。保留少量相邻结构交代部位，沿用原图可辨的纹理，不臆造不可见的材质与结构", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.hero", Name: "详情 · 首屏主视觉", Category: "module", Content: "详情首屏主视觉，商品完整清晰，用光线勾勒轮廓，占画面主要位置；前景、背景与主体层次分明，背景简洁，四周留白自然。商品外观、包装与颜色以商品原图为准，不添加原图没有的配件、赠品或装饰", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.selling", Name: "详情 · 核心卖点图", Category: "module", Content: "核心卖点图，突出一个已知特点，用商品外观与简洁排版说明，仅使用已提供的商品信息，不以想象的原料、成分、功效或认证作证明；每张只保留一个信息重点，文字不覆盖商品和包装标签", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.scene", Name: "详情 · 场景应用图", Category: "module", Content: "场景应用图，把商品放入与真实用途相符的使用场景，人物、动作和道具只用于说明使用方式，不能遮挡商品或改变商品外观；场景光线、透视与商品比例可信，商品仍是唯一主角，不添加原图没有的功能、配件或赠品", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.detail", Name: "详情 · 产品细节图", Category: "module", Content: "产品细节图，从原图清楚可见的边缘、接缝、表面处理或工艺中选一处作为唯一焦点；镜头靠近，让该部位占画面大半，画框切过商品轮廓，保留少量相邻结构交代位置，沿用原图可辨的纹理，不臆造不可见的材质、内部结构或工艺", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.spec", Name: "详情 · 规格参数图", Category: "module", Content: "规格参数图，以信息排版为主，先安排标题区、参数区与留白，再把商品图作为配图；只排版用户提供或原图清楚可读的规格，缺少参数时改为商品外观展示，不编造尺寸、容量、功率、重量或数值，不绘制虚假的测量标注、刻度或认证图标", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.feedback", Name: "详情 · 用户反馈图", Category: "module", Content: "用户反馈图，只使用用户提供的真实评价，把评价作为短引语与商品图分区排版，保留评价原意，不改写成夸张宣传；未提供评价时展示中性的使用场景或商品细节，不生成评价引语、星级、销量、头像、昵称或用户身份", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.package", Name: "详情 · 包装内容图", Category: "module", Content: "包装内容图，把原图可见或用户明确列出的商品、包装盒、配件与赠品按真实数量组合展示，保持各自形状、颜色和包装版式；不凭空添加赠品、套装或替换包装，不把不同视角的同一商品当成多件商品；可用俯拍平铺或整齐排列，商品组完整清晰", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.brand", Name: "详情 · 品牌故事图", Category: "module", Content: "品牌故事图，用材质、光线、场景与克制的构图传达品牌调性，商品仍是视觉中心；不编造品牌历史、产地、奖项、工艺传承或合作信息，可留出品牌名或一句品牌语的排版空间，但不生成用户未提供的文案", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.certificate", Name: "详情 · 品质认证图", Category: "module", Content: "品质认证图，仅在用户提供认证资料时展示对应认证，认证名称、编号与结论逐字使用提供内容；资料不足时改为商品工艺或材质展示，不生成认证标识、证书、检测报告、编号或合格结论，不用徽章和星级暗示认证", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.install", Name: "详情 · 安装指引图", Category: "module", Content: "安装指引图，以一个关键安装动作作为主画面，商品与手部动作清楚，步骤编号、箭头或局部放大只作为辅助；步骤内容只来自用户提供或原图可见的结构，不编造零件、工具、孔位或安装顺序。需要展示多个步骤时，用同一画面内的简洁步骤区，不做多方案拼贴", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.faq", Name: "详情 · 常见问题图", Category: "module", Content: "常见问题图，从用户提供的真实问题与解答中选一个重点，用简短问答区与商品图分区排版；没有提供问答时展示与商品用途相关的中性场景，不生成虚构问题、答案、客服身份、联系方式或售后承诺", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.size", Name: "详情 · 尺码对照图", Category: "module", Content: "尺码对照图，只使用用户提供的真实尺码数据，按清晰的表格或对照区排版，商品图作为辅助；未提供数据时展示商品版型、比例与穿着状态，不生成尺码表、测量数字、身高体重建议或虚构的尺码推荐", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.material", Name: "详情 · 材质纹理图", Category: "module", Content: "材质纹理图，只取一处可见外表面，用局部特写展示原图能辨认的纹理、反光或透光变化。让该表面占画面大半，裁去商品的一部分，保留一小段轮廓交代位置。原图看不清细纹时，拍清楚可见的光泽过渡或边缘，忠实保留原有表面", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "module.detail-page.promotion", Name: "详情 · 结尾促销图", Category: "module", Content: "结尾促销图，作为详情收尾，回到商品主视觉并保持与前序图片一致的光线与背景逻辑；只使用用户明确提供的价格、优惠、期限与活动条件，缺少促销资料时只做商品收尾展示，不生成折扣、原价、倒计时、优惠券或虚构活动", Description: "选择此图片模块时使用，AI 帮写的模块说明也读取此配置。"},
		{Key: "retouch.gloss", Name: "精修 · 增强光泽", Category: "retouch", Content: "增强产品光泽与质感，只调整与真实材质相符的柔和反光，不将哑光改为镜面，不覆盖包装文字", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.repair", Name: "精修 · 修复瑕疵", Category: "retouch", Content: "修复划痕与瑕疵，只清理拍摄污点和偶发损伤，保留真实接缝、印刷纹理与结构", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.clarity", Name: "精修 · 提升清晰度", Category: "retouch", Content: "提升整体清晰度，克制降噪和锐化，不重新绘制文字与图案，不产生锐化白边", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.color", Name: "精修 · 色彩校正", Category: "retouch", Content: "校正色彩，只修正偏色和曝光，以商品原图颜色为准，不改变商品配色", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.perspective", Name: "精修 · 透视校正", Category: "retouch", Content: "修正透视变形，保留商品真实长宽比例和部件关系，不拉伸或重新设计外形", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.background", Name: "精修 · 背景净化", Category: "retouch", Content: "净化背景，清理原有杂物后保持背景材质与场景逻辑；用户明确要求换底时才替换，不新增绿植、摆件或装饰道具", Description: "勾选对应精修项后附加。"},
		{Key: "retouch.basic", Name: "未选精修项的基础处理", Category: "retouch", Content: "基础精修只做轻度曝光、偏色、降噪与清晰度调整，保留真实材质和拍摄场景", Description: "没有勾选任何精修项时使用。"},
		{Key: "image.edit.invariants", Name: "局部编辑保留项", Category: "retouch", Content: "除本次修改项外，以下内容保持不变：商品形状与长宽比例、真实配色、部件结构与连接关系、包装版式与可见文字、原有机位、构图、背景材质与光线；商品在画面中的占比与取景范围保持不变，不为了展示更多背景而缩小商品；未选择的精修项不得追加或顺手美化", Description: "产品精修在修改项之后附加，明确本次只改什么、其余不动。"},
		{Key: "image.clothing.common", Name: "服装通用要求", Category: "clothing", Content: "服装电商摄影，每次只生成一张独立成片。服装原图是商品外观的唯一依据，必须保留真实颜色、版型、印花、Logo、纽扣和缝线，不替换款式，不新增配件或虚构面料成分、尺码、性能、价格和认证。不可见的结构、印花、标签与工艺不作具体臆造；背面素材不足时采用保守展示。整组采用统一光线、色温与背景逻辑。", Description: "直接用于服装生图；用户确认的逐张拍摄要求仍会附加。"},
		{Key: "image.clothing.model", Name: "模特上身要求", Category: "clothing", Content: "模特穿着全部服装原图所组成的同套搭配。模特参考仅用于保持人物身份、脸部和体型，不复制模特原有衣服。保留脸型、发型、发色、眼镜与可见年龄特征，不美化成另一个人。场景参考仅用于背景，不复制其中的人物或服装。衣服自然贴合人体，印花随面料弯曲但保持原有图形结构；手臂不遮挡关键图案。取景遵循用户规划与模特照片可见的身体范围，穿着结构与人体比例自然合理。", Description: "直接用于服装生图；用户确认的逐张拍摄要求仍会附加。"},
		{Key: "image.clothing.generated-model", Name: "虚拟模特上身要求", Category: "clothing", Content: "生成一位虚拟成年模特，穿着服装原图中的商品。取景适合展示这件服装的全貌，手臂避开重要图案，面料自然贴合人体。服装款式与细节始终以服装原图为准。若附有首张上身成片，保持该人物的面容、体型、发型、穿搭和布景，按本张拍摄规划改变展示角度。场景参考仅用于背景。", Description: "用于由服装原图生成模特的上身图。"},
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

func (s *Service) promptSnapshot() ([]promptTemplate, error) {
	if s.ai == nil {
		return defaultPromptTemplates(), nil
	}
	var templates []promptTemplate
	err := s.ai.withConfig(false, func(state *aiConfiguration) error { templates = state.Templates; return nil })
	return templates, err
}

func (s *Service) generationPromptSnapshot() (generationPromptSet, error) {
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
func (s *Service) formatPrompt(w http.ResponseWriter, r *http.Request) {
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
