export type AssetSection = 'hero' | 'story' | 'ecommerce' | 'gallery' | 'tools' | 'social'
export interface MarketingAsset {
  id: string
  src: string
  title: string
  alt: string
  width: number
  height: number
  ratio: string
  sections: readonly AssetSection[]
  provenance: 'generated-concept' | 'reference-image-edit' | 'derived-crop' | 'product-screenshot'
  promptId: string
  referenceId?: string
}

export const conceptDisclosure = 'AI 视觉概念示例'

function artwork(
  id: string,
  path: string,
  title: string,
  alt: string,
  sections: readonly AssetSection[],
  referenceId?: string,
  dimensions = { width: 1120, height: 1400, ratio: '4:5' },
): MarketingAsset {
  return {
    id,
    src: `/images/marketing/${path}`,
    title,
    alt,
    ...dimensions,
    sections,
    provenance: referenceId ? 'reference-image-edit' : 'generated-concept',
    promptId: id,
    ...(referenceId ? { referenceId } : {}),
  }
}

export const marketingAssets = {
  fantasy: artwork(
    'hero-fantasy',
    'sunny/gallery/little-art-shop.webp',
    '街角的创意小店',
    '暖阳下带有薄荷绿百叶窗的微缩海滨画室，门前有小机器人与花朵的手作风 3D 插画',
    ['gallery', 'tools'],
  ),
  skincareBase: artwork(
    'skincare-base',
    'commerce-2026-10-22/skincare-base.webp',
    '从清晰的商品开始',
    '深绿色瓶盖的象牙白护肤罐与同色包装盒置于浅灰背景的商品基础摄影',
    ['ecommerce', 'tools'],
  ),
  skincare: artwork(
    'hero-skincare',
    'commerce-2026-10-22/skincare-scene.webp',
    '让质感被看见',
    '同一象牙白护肤罐与包装盒置于暖阳洞石台面和橄榄叶影中的商品场景参考编辑图',
    ['ecommerce', 'gallery', 'tools'],
    'skincare-base',
  ),
  fashion: artwork(
    'hero-fashion',
    'hero/editorial-fashion.webp',
    '衣着，自有表达',
    '身穿深色西装、坐在柔和光影中的女性写实时尚人像',
    ['gallery', 'tools'],
  ),
  stillLife: artwork(
    'hero-still-life',
    'sunny/gallery/flower-still-life.webp',
    '把日常放进想象',
    '薄荷绿陶瓷花瓶、白色雏菊与珊瑚色小鸟构成的暖阳手作风 3D 静物',
    ['gallery', 'tools'],
  ),
  future: artwork(
    'hero-future',
    'hero/future-conservatory.webp',
    '一间想象力温室',
    '玻璃穹顶下橄榄树与静水池的未来温室建筑视觉',
    ['gallery', 'tools'],
  ),
  city: {
    id: 'ai-story-city',
    src: '/images/marketing/hero/coastal-creator-2x.webp',
    title: '沿着阳光，展开想象',
    alt: '小黄机器人骑薄荷绿踏板车穿过鲜花与粉彩房屋环绕的海滨小镇，暖阳手作风 3D 插画',
    width: 3328,
    height: 1872,
    ratio: '16:9',
    sections: ['hero', 'story', 'tools'],
    provenance: 'reference-image-edit',
    promptId: 'ai-story-city-4k',
    referenceId: 'ai-story-city-sunny',
  } satisfies MarketingAsset,
  perfume: artwork(
    'ecommerce-perfume',
    'ecommerce/amber-perfume.webp',
    '香水',
    '暖金色香水瓶置于石材窗台上的写实商品摄影',
    ['ecommerce', 'gallery', 'tools'],
  ),
  coffee: artwork(
    'ecommerce-coffee',
    'ecommerce/coffee-ritual.webp',
    '咖啡',
    '深色咖啡袋、拿铁与散落咖啡豆置于木桌的写实商品摄影',
    ['ecommerce', 'gallery'],
  ),
  lifestyle: artwork(
    'ecommerce-lifestyle',
    'ecommerce/sculptural-light.webp',
    '家居',
    '雕塑感台灯与花瓶置于浅色空间中的写实家居摄影',
    ['ecommerce', 'tools'],
  ),
  accessory: artwork(
    'ecommerce-accessory',
    'ecommerce/leather-accessory.webp',
    '配饰',
    '深蓝皮革肩包置于石材台面的写实商品摄影',
    ['ecommerce', 'gallery', 'tools'],
  ),
  cityDetail: {
    id: 'gallery-city',
    src: '/images/marketing/gallery/coastal-detail-2x.webp',
    title: '小小旅程，大大想象',
    alt: '海滨小镇中骑着薄荷绿踏板车的小黄机器人，手作风 3D 主视觉的竖版裁切',
    width: 840,
    height: 1050,
    ratio: '4:5',
    sections: ['gallery'],
    provenance: 'derived-crop',
    promptId: 'ai-story-city-4k',
    referenceId: 'ai-story-city',
  } satisfies MarketingAsset,
  workbench: {
    id: 'workbench-creation',
    src: '/images/marketing/workbench/workbench-creation-2026-10.webp',
    title: '真实创作工作台',
    alt: 'iStudio 创作工作台界面：左侧填写画面描述、添加参考图并选择模型与 16:9、4K 参数，右侧显示已生成的海滨小镇图片',
    width: 2880,
    height: 1800,
    ratio: '8:5',
    sections: ['tools'],
    provenance: 'product-screenshot',
    promptId: 'workbench-creation',
  } satisfies MarketingAsset,
  social: {
    id: 'social-cover',
    src: '/images/marketing/hero/coastal-og-2x.webp',
    title: 'iStudio 创作世界',
    alt: 'iStudio 官网暖阳海滨机器人手作风 3D 视觉概念分享图',
    width: 1200,
    height: 630,
    ratio: '40:21',
    sections: ['social'],
    provenance: 'derived-crop',
    promptId: 'ai-story-city-4k',
    referenceId: 'ai-story-city',
  } satisfies MarketingAsset,
}

export const heroArtwork = marketingAssets.city
export const galleryAssets = [
  marketingAssets.fantasy,
  marketingAssets.perfume,
  marketingAssets.fashion,
  marketingAssets.future,
]
export const productComparison = {
  before: marketingAssets.skincareBase,
  after: marketingAssets.skincare,
}
