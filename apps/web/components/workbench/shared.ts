import type { CommerceTaskType } from '@/lib/contracts'

export type WorkbenchMode = 'general' | 'commerce'
export type ConfigSide = 'left' | 'right'
export type GeneralStyle = 'unspecified' | 'studio' | 'minimal' | 'fresh' | 'technology' | 'guochao'
export type ReferenceStrength = 'low' | 'medium' | 'high'
export type ModuleMode = 'smart' | 'custom'

export const taskMeta: Record<CommerceTaskType, { title: string; description: string; image: string }> = {
  'product-main': {
    title: '商品主图',
    description: '生成适配平台规范的商品主视觉',
    image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1400&q=88',
  },
  'detail-page': {
    title: '详情页',
    description: '围绕商品信息生成详情页素材',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=88',
  },
  'viral-recreate': {
    title: '爆款复刻',
    description: '参考爆款视觉重构商品画面',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1400&q=88',
  },
  'product-retouch': {
    title: '产品精修',
    description: '修复和提升商品原图质量',
    image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88',
  },
}

export const commerceTasks = Object.entries(taskMeta) as Array<[CommerceTaskType, (typeof taskMeta)[CommerceTaskType]]>

export const productMainModules = [['hero', '主图首图'], ['white', '白底主图'], ['selling', '卖点主图'], ['scene', '场景主图'], ['detail', '细节主图']] as const
export const detailModules = [['hero', '首屏主视觉'], ['selling', '核心卖点图'], ['scene', '场景应用图'], ['detail', '产品细节图'], ['spec', '规格参数图'], ['feedback', '用户反馈图'], ['package', '包装内容图'], ['brand', '品牌故事图'], ['certificate', '品质认证图'], ['install', '安装指引图'], ['faq', '常见问题图'], ['size', '尺码对照图'], ['material', '材质纹理图'], ['promotion', '结尾促销图']] as const

// 模块 key -> 中文标签，供结果图角标展示归属模块。同 key 在不同任务类型下文案不同，按任务类型取值。
const moduleLabelsByTaskType: Record<string, Record<string, string>> = {
  'product-main': Object.fromEntries(productMainModules),
  'detail-page': Object.fromEntries(detailModules),
}

/** 取模块 key 对应中文标签；未知任务类型或未知 key 回退空串，调用方按需展示。 */
export function moduleLabel(taskType: string, moduleKey: string): string {
  return moduleLabelsByTaskType[taskType]?.[moduleKey] ?? ''
}

export const platformOptions = [['smart', '智能匹配'], ['taobao', '淘宝'], ['1688', '1688'], ['tmall', '天猫'], ['pinduoduo', '拼多多'], ['jd', '京东'], ['douyin', '抖音'], ['amazon', '亚马逊'], ['temu', 'TEMU'], ['ebay', 'eBay']] as const
export const languageOptions = [['none', '不新增文字（保留包装文字）'], ['zh-CN', '中文（简体）'], ['zh-TW', '中文（繁体）'], ['en', '英文'], ['ja', '日语'], ['ko', '韩文'], ['th', '泰语'], ['ms', '马来语'], ['id', '印尼语'], ['ru', '俄语']] as const
export const retouchOptions = [['gloss', '增强产品光泽'], ['repair', '修复划痕瑕疵'], ['clarity', '提升整体清晰度'], ['color', '色彩校正'], ['perspective', '修正透视变形'], ['background', '背景净化']] as const

/** 基础参数下拉统一复用下面这份数据，避免组件里各写一份 */
export const styleOptions = [['unspecified', '不指定'], ['studio', '摄影棚'], ['minimal', '极简'], ['fresh', '清新'], ['technology', '科技'], ['guochao', '国潮']] as const
export const modelOptions = [['gpt-image-2', 'GPT Image 2'], ['gemini-2.5-flash-image', 'Gemini 2.5 Flash'], ['gemini-3.1-flash-image', 'Gemini 3.1 Flash'], ['gemini-3-pro-image', 'Gemini 3 Pro Image']] as const
export const ratioOptions = [['1:1', '1:1 方图'], ['3:4', '3:4 竖图'], ['4:3', '4:3 横图'], ['9:16', '9:16 竖屏'], ['16:9', '16:9 宽屏']] as const
export const resolutionOptions = [['1K', '1K'], ['2K', '2K'], ['4K', '4K']] as const
export const countOptions = Array.from({ length: 16 }, (_, index) => [String(index + 1), `${index + 1} 张`] as const)

/** 通用生图的快捷标签：点击写入描述，再点一次移除，不会覆盖用户已经写好的内容 */
export const promptQuickTags = ['产品摄影', '自然光', '高级感', '电商白底', '生活方式', '极简', '户外'] as const

/** 电商需求的结构化字段，用于提示用户该写什么（不虚构任何商品信息） */
export const requirementFields = ['产品', '核心卖点', '目标人群', '视觉风格', '构图要求'] as const

export function optionLabel(options: readonly (readonly [string, string])[], value: string) {
  return options.find(([optionValue]) => optionValue === value)?.[1] ?? value
}

/** 各模式允许上传的素材张数上限（与后端 referenceAssets/productAssets 的 6 张校验一致） */
export function referenceLimit(mode: WorkbenchMode, task: CommerceTaskType) {
  if (mode === 'general') return 6
  if (task === 'product-retouch') return 1
  if (task === 'viral-recreate') return 3
  return 6
}

/**
 * 快捷标签按「，」独立成段：命中时只删掉整段，没命中时追加到句尾，
 * 用户自己写的内容始终原样保留。
 */
function promptTagSegments(prompt: string) {
  const trimmed = prompt.trim()
  return trimmed ? trimmed.split(/[，,]\s*/).filter(Boolean) : []
}

function normalizeTagSegment(segment: string) {
  return segment.trim().replace(/[。.；;\s]+$/, '')
}

/** 只有标签独立成段时才算「已选中」，避免描述里恰好出现同名词就误亮 */
export function hasPromptTag(prompt: string, tag: string) {
  return promptTagSegments(prompt).some((segment) => normalizeTagSegment(segment) === tag)
}

export function togglePromptTag(prompt: string, tag: string) {
  const segments = promptTagSegments(prompt)
  const index = segments.findIndex((segment) => normalizeTagSegment(segment) === tag)
  if (index >= 0) return segments.filter((_, segmentIndex) => segmentIndex !== index).join('，')
  if (segments.length === 0) return tag
  // 追加时把句号留在最后，避免出现「清晰。，产品摄影」这样的双重标点
  const trailing = prompt.match(/[。.]+$/)?.[0] ?? ''
  const head = prompt.trim().replace(/[。.]$/, '')
  return `${head}，${tag}${trailing}`
}

/** 需求字段快捷插入：只补齐缺失的字段名，保留用户已经写好的内容 */
export function appendRequirementField(requirements: string, field: string) {
  const trimmed = requirements.trim()
  if (trimmed.includes(`${field}：`)) return trimmed
  return trimmed ? `${trimmed}\n${field}：` : `${field}：`
}

/** AI 帮写：把需求整理成「产品 / 卖点 / 人群 / 风格 / 构图」骨架，缺哪补哪 */
export function buildRequirementDraft(requirements: string) {
  const skeleton = requirementFields.reduce((draft, field) => appendRequirementField(draft, field), requirements).trim()
  if (!requirements.trim()) return `请围绕以下要点生成清晰统一的电商图片方案。\n${skeleton}`
  return skeleton
}

/**
 * 提示词优化（本地结构化，未接入真实模型）：
 * 按「主体场景 → 画面要求 → 光线质感 → 风格 → 输出约束」重组用户描述。
 */
export function buildEnhancedPrompt(prompt: string, style: GeneralStyle) {
  const base = prompt.trim().replace(/[。；;，,\s]+$/, '')
  if (!base) return ''
  const lines = [`${base}。`, '画面要求：主体清晰完整，构图平衡，留白充足，无杂乱元素。', '光线与质感：柔和自然光，材质与细节清晰，高级商业质感。']
  if (style !== 'unspecified') lines.push(`画面风格：${optionLabel(styleOptions, style)}。`)
  lines.push('输出要求：高分辨率，真实可信，不添加未指定的文字与 Logo。')
  return lines.join('\n')
}

/** 各任务在画布空态展示的设计参考图 */
export const generalCanvasImage = 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88'
