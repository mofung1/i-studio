import type { PromptTemplate } from './ai-settings'

const groupLabels = [
  ['enhance', 'AI 帮写与优化'],
  ['reverse', '图片反推'],
  ['general', '通用生图'],
  ['commerce', '电商生成要求'],
  ['main-modules', '商品主图模块'],
  ['detail-modules', '商品详情模块'],
  ['retouch', '产品精修'],
  ['clothing-generation', '服装生成要求'],
  ['clothing-styles', '服装拍摄风格'],
  ['clothing-modules', '服装图片图种'],
  ['clothing-planning', '服装拍摄规划'],
  ['other', '其他模板'],
] as const

export function promptGroupKey(template: PromptTemplate): string {
  if (template.category === 'reverse') return 'reverse'
  if (['system', 'mode'].includes(template.category)) return 'enhance'
  if (['general', 'commerce', 'retouch'].includes(template.category)) return template.category
  if (template.key.startsWith('module.product-main.')) return 'main-modules'
  if (template.key.startsWith('module.detail-page.')) return 'detail-modules'
  if (template.key.startsWith('image.clothing.')) return 'clothing-generation'
  if (template.key.startsWith('clothing.style.')) return 'clothing-styles'
  if (template.key.startsWith('module.clothing-set.')) return 'clothing-modules'
  if (template.category === 'clothing') return 'clothing-planning'
  return 'other'
}

export function promptGroupLabel(template: PromptTemplate): string {
  return groupLabels.find(([key]) => key === promptGroupKey(template))?.[1] ?? '其他模板'
}

export function promptTemplateLabel(template: PromptTemplate): string {
  const names: Record<string, string> = {
    rewrite: '通用提示词优化',
    requirements: '电商 AI 帮写',
    'product-main': '商品主图 AI 帮写',
    'detail-page': '商品详情 AI 帮写',
    'viral-recreate': '爆款复刻 AI 帮写',
    'product-retouch': '产品精修 AI 帮写',
  }
  return names[template.key] ?? template.name.replace(/^(主图|详情|服装|精修|拍摄风格) · /, '')
}

export function groupPromptTemplates(templates: PromptTemplate[], query = '') {
  const search = query.trim().toLowerCase()
  return groupLabels
    .map(([key, label]) => ({
      key,
      label,
      templates: templates.filter(
        (template) =>
          promptGroupKey(template) === key &&
          (!search ||
            `${template.name} ${template.description ?? ''} ${label}`
              .toLowerCase()
              .includes(search)),
      ),
    }))
    .filter((group) => group.templates.length > 0)
}
