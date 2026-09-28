export type ShowcaseItem = {
  id: string
  title: string
  titleEn: string
  description: string
  asset: string
  format: string
  href: string
}

export const imageAssets = {
  hero: '/images/showcase-main.jpg',
  detail: '/images/showcase-detail.jpg',
  editorial: '/images/showcase-editorial.jpg',
  lifestyle: '/images/showcase-lifestyle.jpg',
  campaign: '/images/showcase-campaign.jpg',
  social: '/images/showcase-social.jpg',
} as const

export const productShowcase: ShowcaseItem[] = [
  {
    id: 'hero',
    title: '商品主图',
    titleEn: 'Product Hero Shot',
    description: '干净棚拍、真实材质与统一光影，直接用于货架首图。',
    asset: imageAssets.hero,
    format: '1:1 · Studio',
    href: '/workbench?mode=commerce&task=product-main',
  },
  {
    id: 'lifestyle',
    title: '生活场景',
    titleEn: 'Lifestyle Scene',
    description: '把商品放进真实空间，让用户看到使用氛围。',
    asset: imageAssets.lifestyle,
    format: '4:5 · Lifestyle',
    href: '/workbench?mode=commerce&task=detail-page',
  },
  {
    id: 'detail',
    title: '详情视觉',
    titleEn: 'Detail Page',
    description: '自动组织功能卖点、材质细节与场景信息。',
    asset: imageAssets.detail,
    format: '3:4 · Detail',
    href: '/workbench?mode=commerce&task=detail-page',
  },
  {
    id: 'social',
    title: '社媒广告',
    titleEn: 'Social Ad',
    description: '生成适合信息流投放的高冲击力广告画面。',
    asset: imageAssets.social,
    format: '9:16 · Social',
    href: '/workbench?mode=general',
  },
  {
    id: 'campaign',
    title: '营销 Banner',
    titleEn: 'Campaign Banner',
    description: '一次延展主视觉，覆盖活动页、Banner 与品牌内容。',
    asset: imageAssets.campaign,
    format: '16:9 · Campaign',
    href: '/workbench?mode=general',
  },
]
