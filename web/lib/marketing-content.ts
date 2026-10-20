export interface FaqItem {
  question: string
  answer: string
}
export interface MarketingExample {
  title: string
  description: string
  /** Only add an image after confirming public display rights. Paths are local to public/. */
  image?: {
    src: string
    alt: string
    width: number
    height: number
    heroFrame?: { frames: number; index: number; alt: string }
  }
  kind: 'art' | 'product' | 'fashion' | 'photo' | 'retouch' | 'prompt'
}
export interface ToolContent {
  slug: string
  name: string
  title: string
  description: string
  h1: string
  intro: string
  cta: string
  href: string
  group: 'ai' | 'commerce'
  highlights: { title: string; text: string }[]
  steps: { title: string; text: string }[]
  examples: MarketingExample[]
  note: string
  faqs: FaqItem[]
}

export const homeDescription =
  'iStudio 是一站式 AI 图片创作平台，支持文字生成图片、参考图创作、AI 商品主图制作、产品精修、服装组图及图片提示词反推，帮助个人创作者和电商商家高效完成图片创作。'
export const homeExamples: MarketingExample[] = [
  { kind: 'art', title: '想象，不止一种画面', description: 'AI 艺术创作 · 待补充授权案例' },
  {
    kind: 'product',
    title: '给商品一个好场景',
    description: '电商商品图 · 功能示意',
    image: {
      src: '/images/commerce/main.webp',
      width: 1800,
      height: 607,
      alt: 'AI 生成的面霜商品摄影前后场景示意，非真实任务结果',
      heroFrame: { frames: 2, index: 1, alt: '面霜在暖光石材场景中的商品展示功能示意' },
    },
  },
  {
    kind: 'fashion',
    title: '让穿搭有更多表达',
    description: '服装展示 · 功能示意',
    image: {
      src: '/images/commerce/clothing.webp',
      width: 1774,
      height: 887,
      alt: 'AI 生成的米白衬衫平铺及模特上身功能示意',
      heroFrame: { frames: 3, index: 1, alt: '米白衬衫的正面模特上身功能示意' },
    },
  },
  { kind: 'photo', title: '把光影写进灵感', description: '商业摄影 · 待补充授权案例' },
]

export const homeSteps = [
  { title: '选择创作工具', text: '选择 AI 生图、电商商品图或图片反推，进入对应创作界面。' },
  { title: '输入创作需求', text: '输入画面描述或上传参考图，选择模型、比例和所需参数。' },
  {
    title: '生成并下载',
    text: '登录后确认预计积分并提交。任务完成后查看结果、下载图片，或继续调整。',
  },
]

export const homeFaqs: FaqItem[] = [
  {
    question: 'iStudio 是什么？',
    answer:
      'iStudio 是一站式 AI 图片创作平台，为个人创作者、电商商家及设计师提供图片生成、参考图创作、商品视觉制作与图片提示词反推工具。',
  },
  {
    question: 'iStudio 支持哪些 AI 图片创作功能？',
    answer:
      '目前支持文字生图、参考图创作、图片反推，以及商品主图、商品详情、爆款复刻、产品精修和服装组图。可用模型与分析能力由站点管理员配置。',
  },
  {
    question: '如何使用 AI 图片生成器？',
    answer:
      '进入工作台，输入图片描述，可选上传参考图，再选择已上架模型、比例、清晰度和张数。登录并确认预计积分后提交，在结果区域查看和下载。',
  },
  {
    question: '可以使用自己的图片作为参考吗？',
    answer:
      '可以。通用生图支持选择本地图片或本人素材库中的图片，最多添加 6 张参考图。请使用自己有权处理的图片；参考效果取决于模型和描述。',
  },
  {
    question: '可以使用 iStudio 制作电商商品图吗？',
    answer:
      '可以。现有电商工具提供商品主图、详情素材、产品精修和服装组图等流程。生成后请核对商品轮廓、颜色、包装文字、印花和服装细节，再决定是否用于商品展示。',
  },
  {
    question: '生成图片需要消耗积分吗？',
    answer:
      '需要。生图前会显示所选模型的预计积分；提交时预留，按实际保存的图片张数结算，未交付部分退回。具体价格、注册赠送和可用余额以站点配置及账户显示为准。进入工作台本身不收费。',
  },
  {
    question: '生成后的图片可以下载吗？',
    answer:
      '可以。完成后可在结果区下载图片，也可在本人资产库查看历史作品、再次下载或继续创作。服装组图还支持整组 ZIP 下载。',
  },
]

export const tools: ToolContent[] = [
  {
    slug: 'ai-image-generator',
    name: 'AI 图片生成',
    group: 'ai',
    title: '在线 AI 图片生成器 - 文字与参考图生成图片',
    description:
      '使用 iStudio 在线 AI 图片生成器，从文字描述或自己的参考图片开始创作，选择风格、比例与清晰度，并管理生成作品。',
    h1: '在线 AI 图片生成器',
    intro:
      '把脑海中的画面写下来。用文字确定主体与氛围，用参考图补充视觉方向，在同一个工作台完成生成、查看与再次创作。',
    cta: '立即生成 AI 图片',
    href: '/studio?mode=general',
    highlights: [
      {
        title: '文字描述，形成画面',
        text: '描述主体、环境、构图和光线。支持提示词编辑与 AI 帮写，可用能力取决于站点配置。',
      },
      {
        title: '自己的图片，也能成为起点',
        text: '从本地或本人素材库选择最多 6 张参考图，设置参考强度，让视觉方向更清晰。',
      },
      {
        title: '按用途选择画幅',
        text: '选择画面比例、风格以及模型支持的 1K、2K 或 4K 清晰度；一次可提交 1–4 张。',
      },
    ],
    steps: [
      { title: '描述你的想法', text: '在 AI 生图中输入主体、构图、场景和希望呈现的氛围。' },
      { title: '补充参考与参数', text: '按需加入参考图片，选择已上架模型、图片比例、风格和张数。' },
      {
        title: '查看并继续创作',
        text: '确认预计积分后生成；下载满意的图片，或载入历史参数进一步调整。',
      },
    ],
    examples: [homeExamples[0]!, homeExamples[3]!],
    note: '风格与参考强度通过文字指令传递给模型；实际尺寸和参考效果取决于所选模型。案例区域将在获得展示授权后补充真实作品。',
    faqs: [
      homeFaqs[3]!,
      {
        question: '能否选择不同风格和图片比例？',
        answer:
          '可以。工作台提供风格、比例、清晰度和张数设置；模型能力可能限制可用选项，实际输出以结果中的图片像素为准。',
      },
      homeFaqs[5]!,
      homeFaqs[6]!,
    ],
  },
  {
    slug: 'image-to-prompt',
    name: '图片反推提示词',
    group: 'ai',
    title: '图片反推提示词工具 - AI 图片描述提取',
    description:
      '上传图片，用 iStudio 分析画面或提取视觉风格，获得可编辑的中英文提示词，复制、保存或带入 AI 生图工作台。',
    h1: 'AI 图片反推提示词工具',
    intro:
      '看到喜欢的构图，却不知道如何描述？从一张图片提取主体、光影和风格线索，把视觉观察转成可以继续编辑的中英文提示词。',
    cta: '开始图片反推',
    href: '/studio?tool=image-to-prompt',
    highlights: [
      {
        title: '还原画面，或只提取风格',
        text: '选择两种分析方向：描述图片内容，或集中提炼光线、配色、材质和视觉风格。',
      },
      {
        title: '中英文描述，可继续编辑',
        text: '分析结果提供双语提示词。可以编辑、复制、保存到我的提示词，再补充自己的想法。',
      },
      {
        title: '从分析自然进入创作',
        text: '把描述追加或替换到生图输入框，可选择携带原图作为参考；分析任务切页后仍可恢复。',
      },
    ],
    steps: [
      {
        title: '选择图片与分析方向',
        text: '在图片反推中上传有权处理的图片，选择还原画面或只提取风格。',
      },
      {
        title: '分析并检查描述',
        text: '开始分析后等待结果，阅读中英文描述，修改不准确或不需要的细节。',
      },
      {
        title: '复制、保存或应用',
        text: '复制提示词、存入个人提示词库，或带入 AI 生图并按需附上原图参考。',
      },
    ],
    examples: [
      {
        kind: 'prompt',
        title: '把画面变成创作语言',
        description: '上传图片 → 选择分析方向 → 编辑双语提示词 · 流程示意',
      },
    ],
    note: '图片反推需要管理员启用支持视觉识别的 Prompt 服务和对应分析模板。结果是对图片的分析，不能恢复原作者的原始提示词。',
    faqs: [
      {
        question: '图片反推能找回原始提示词吗？',
        answer:
          '不能保证。工具分析可见画面并生成描述，适合学习构图、风格和组织提示词，不代表原作者实际使用的提示词。',
      },
      {
        question: '支持中文和英文吗？',
        answer: '现有反推流程提供中英文结果，可以分别编辑和复制，也可以保存到个人提示词。',
      },
      {
        question: '为什么提示图片分析暂不可用？',
        answer:
          '图片反推依赖管理员配置的视觉识别服务及已启用的分析模板。服务未配置、缺少 Vision 能力或模板停用时，界面会提示当前原因。',
      },
      {
        question: '离开页面会丢失分析吗？',
        answer:
          '分析在后台继续，切页或刷新可以恢复；可在图片反推中查看临时记录、取消任务或清除记录。临时记录会按照站点配置过期清理。',
      },
    ],
  },
  {
    slug: 'ai-product-photo',
    name: 'AI 商品图制作',
    group: 'commerce',
    title: 'AI 商品图生成器 - 在线制作商品主图',
    description:
      '上传商品照片，在 iStudio 中制作 AI 商品主图与场景营销图片，按模块规划画面，选择比例并核对生成结果。',
    h1: 'AI 商品图生成器',
    intro:
      '让一张商品照片，拥有适合展示的场景。上传商品原图，用文字说明使用环境、背景和构图，把拍摄想法变成商品视觉素材。',
    cta: '开始制作商品图',
    href: '/studio?mode=commerce&task=product-main',
    highlights: [
      {
        title: '区分商品与构图参考',
        text: '商品原图用来说明主体，参考图片用来表达场景与版式。分开上传，减少视觉需求的混淆。',
      },
      {
        title: '按场景规划主图',
        text: '填写主图需求，选择目标平台、比例与图片模块，组合场景图、展示图等素材。',
      },
      {
        title: '从主图延伸到详情素材',
        text: '电商工具中还可选择商品详情流程，按已有商品信息组织模块；缺少的信息需要自行补充。',
      },
    ],
    steps: [
      {
        title: '上传清楚的商品照片',
        text: '进入商品主图工具，添加商品原图；如果有目标版式，再添加构图参考。',
      },
      {
        title: '说明商品展示场景',
        text: '填写主体、背景和光影需求，选择平台、图片模块、比例与已上架模型。',
      },
      {
        title: '逐张核对并保存',
        text: '确认预计积分后生成，比较商品轮廓、标识和包装文字，下载合适的结果。',
      },
    ],
    examples: [homeExamples[1]!],
    note: '展示图由 AI 生成，用于说明商品主图流程，不是实际任务的前后效果保证。模型可能改动轮廓、包装小字或材质，请对照原图审核。',
    faqs: [
      {
        question: '可以制作哪些商品图片？',
        answer:
          '现有工具支持商品主图、商品详情素材和场景营销图片。可上传商品原图、填写需求，并使用模块组合生成多张图片。',
      },
      {
        question: '是否保证商品细节完全不变？',
        answer:
          '不保证。系统会使用保留商品主体的提示约束，但轮廓、包装文字、颜色和细小标识仍可能变化，需要人工对照原图核验。',
      },
      {
        question: '可以参考其他图片的构图吗？',
        answer:
          '可以把有权使用的图片加入构图参考区域，并说明希望借鉴的光影或布局；商品原图应单独放在商品素材区域。',
      },
      homeFaqs[5]!,
    ],
  },
  {
    slug: 'product-retouch',
    name: '产品图片精修',
    group: 'commerce',
    title: 'AI 产品图片精修工具',
    description:
      '使用 iStudio AI 产品图片精修工具，上传商品照片，选择精修方向并补充需求，改善商品光影、材质与画面表现。',
    h1: 'AI 产品图片精修工具',
    intro:
      '已有商品照片，从细节继续打磨。围绕材质、光影和画面瑕疵提出精修要求，保留原场景作为起点，逐项检查产品视觉的变化。',
    cta: '开始产品图片精修',
    href: '/studio?mode=commerce&task=product-retouch',
    highlights: [
      {
        title: '以原场景为基础',
        text: '精修流程默认围绕原图改善画面，适合整理表面瑕疵、材质层次与光影表现。',
      },
      {
        title: '明确要改善的细节',
        text: '选择精修方向，并补充需要保留或调整的内容。背景、反光和边缘等要求可以用文字说明。',
      },
      {
        title: '与原图对照检查',
        text: '生成结果可与原图比较。核验产品形状、颜色和标识后，再保存适合展示的版本。',
      },
    ],
    steps: [
      {
        title: '添加需要精修的图片',
        text: '在产品精修工具中上传商品照片，也可以从本人素材库中选择。',
      },
      {
        title: '选择并补充精修要求',
        text: '设置精修项，描述光影、材质或背景需求，说明必须保留的产品细节。',
      },
      {
        title: '比较结果与原图',
        text: '确认积分后提交，生成完成后检查细节；需要时在资产库使用图片对比再下载。',
      },
    ],
    examples: [
      {
        kind: 'retouch',
        title: '从平淡光线，到更清楚的材质',
        description: '金属杯精修前后 · 功能示意',
        image: {
          src: '/images/commerce/retouch.webp',
          width: 1800,
          height: 600,
          alt: 'AI 生成的金属杯精修功能示意，比较表面质感与光影',
        },
      },
    ],
    note: '精修并非无损修图。AI 可能改变产品边缘、反光、文字和细节；这里的对照为 AI 功能示意，正式使用前请检查结果。',
    faqs: [
      {
        question: '精修会自动更换商品背景吗？',
        answer:
          '默认精修提示以保留原场景为基础。如果希望调整背景，需要明确描述；模型仍可能改变画面，需要检查生成结果。',
      },
      {
        question: '可以只修某一个瑕疵吗？',
        answer:
          '可以在补充要求中说明希望改善的部位，但当前流程是基于整张图片生成，不是通过局部蒙版精确修改。',
      },
      {
        question: '在哪里对比原图和精修图？',
        answer: '结果区或资产库提供图片对比入口，可选择原图和生成图片，并排或通过滑杆查看差异。',
      },
    ],
  },
  {
    slug: 'ai-fashion-model',
    name: 'AI 服装模特图',
    group: 'commerce',
    title: 'AI 服装模特图生成工具',
    description:
      '用 iStudio 服装组图工具上传服装素材，选择模特上身或商品组图，编辑逐张拍摄规划并生成服装展示图片。',
    h1: 'AI 服装模特图生成工具',
    intro:
      '从服装素材开始，先规划每一张展示图。选择模特上身或商品组图，编辑拍摄方向，再生成适合比较与筛选的一组服装图片。',
    cta: '开始制作服装模特图',
    href: '/studio?mode=commerce&task=clothing-set',
    highlights: [
      {
        title: '两种服装展示方向',
        text: '服装组图包含商品组图与模特上身两种模式。模特上身需要服装照片和 1 张模特参考照片。',
      },
      {
        title: '先看规划，再生成',
        text: '可使用 AI 识图辅助规划，也可以手动安排；逐张查看和修改拍摄需求，确认后再提交生图。',
      },
      {
        title: '整组管理，逐张筛选',
        text: '生成后逐图查看，支持单张下载与整组 ZIP 下载，也可从历史恢复完整配置。',
      },
    ],
    steps: [
      {
        title: '上传服装素材',
        text: '添加 1–6 张服装照片，选择商品组图或模特上身；模特上身还需上传 1 张有权使用的模特照片。',
      },
      {
        title: '编辑逐张拍摄规划',
        text: '按需使用 AI 分析或手动规划，查看并修改每一张图片的展示需求。',
      },
      {
        title: '确认生成并筛选',
        text: '确认规划和预计积分后生成，检查服装版型、印花及模特表现，再单张或整组下载。',
      },
    ],
    examples: [homeExamples[2]!],
    note: '示意图用于解释平铺到上身展示的方向。实际结果可能出现印花、纽扣、版型或人物一致性偏差，不能替代对商品实物的核验。',
    faqs: [
      {
        question: '服装组图和模特上身有什么区别？',
        answer:
          '商品组图围绕服装本身的展示组织画面，模特上身则面向穿着效果，需额外提供 1 张有权使用的模特参考照片。两者都使用服装素材和逐张拍摄规划。',
      },
      {
        question: '必须使用 AI 规划吗？',
        answer:
          '不必。可以手动编辑拍摄规划。AI 识图辅助规划是否可用，取决于管理员配置的 Prompt 服务和视觉能力。',
      },
      {
        question: '能保证印花、版型和模特完全一致吗？',
        answer:
          '不能保证。系统会传递保留服装特征的要求，但细小图案、面料褶皱和人物一致性仍需逐张核对。',
      },
      {
        question: '可以下载整组图片吗？',
        answer: '可以。服装组图支持单图下载和整组 ZIP 下载，历史记录也可恢复完整配置继续创作。',
      },
    ],
  },
]

export const marketingPaths = ['/', ...tools.map((tool) => `/tools/${tool.slug}`)]
export const repositoryUrl = 'https://github.com/mofung1/i-studio'
