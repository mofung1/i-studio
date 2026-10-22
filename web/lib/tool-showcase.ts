import { tools } from './marketing-content'
import { showcaseAssets } from './tool-showcase-assets'
import type { MarketingAsset } from './marketing-assets'

export interface ShowcaseTool {
  id: string
  name: string
  description: string
  seoHref: string
  studioHref: string
  cta: string
  asset: MarketingAsset
  input?: MarketingAsset
  visual: 'artwork' | 'prompt' | 'retouch'
  anchor?: string
}

function existing(slug: string) {
  const tool = tools.find((item) => item.slug === slug)
  if (!tool) throw new Error(`Missing tool route: ${slug}`)
  return { seoHref: `/tools/${tool.slug}`, studioHref: tool.href, cta: tool.cta }
}

export const showcaseTools: ShowcaseTool[] = [
  {
    ...existing('ai-image-generator'),
    id: 'image-generator',
    name: 'AI 图片生成',
    description: '写下想法，生成你的画面。',
    asset: showcaseAssets.generator,
    visual: 'artwork',
    anchor: 'ai-tools',
  },
  {
    ...existing('ai-product-photo'),
    id: 'product-photo',
    name: 'AI 商品图制作',
    description: '制作商品主图与场景图，按模块延展详情素材。',
    asset: showcaseAssets.product,
    visual: 'artwork',
    anchor: 'commerce-tools',
  },
  {
    ...existing('product-retouch'),
    id: 'product-retouch',
    name: '产品图片精修',
    description: '调整光影，打磨产品质感。',
    asset: showcaseAssets.retouch,
    input: showcaseAssets.product,
    visual: 'retouch',
  },
  {
    ...existing('ai-fashion-model'),
    id: 'fashion-model',
    name: 'AI 服装模特图',
    description: '用服装与模特照片，探索上身效果。',
    asset: showcaseAssets.fashion,
    visual: 'artwork',
  },
  {
    ...existing('image-to-prompt'),
    id: 'image-to-prompt',
    name: '图片反推提示词',
    description: '从一张图，提炼创作提示词。',
    asset: showcaseAssets.prompt,
    visual: 'prompt',
  },
]
