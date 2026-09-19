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

/** 各任务在画布空态展示的设计参考图 */
export const generalCanvasImage = 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88'
