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
  provenance: 'generated-concept' | 'reference-image-edit' | 'derived-crop'
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
    'sunny/commerce/skincare-base.webp',
    '从清晰的商品开始',
    '海滨小镇窗台上的鹅黄护肤罐、薄荷绿盖边与珊瑚色纸盒，手作质感 3D 商品基础图',
    ['ecommerce', 'tools'],
    undefined,
    { width: 1280, height: 960, ratio: '4:3' },
  ),
  skincare: artwork(
    'hero-skincare',
    'sunny/commerce/skincare-scene.webp',
    '让质感被看见',
    '同一鹅黄护肤罐与珊瑚色纸盒置于薄荷绿拱门展台中的手作质感 3D 参考编辑图',
    ['ecommerce', 'gallery', 'tools'],
    'skincare-base',
    { width: 1280, height: 960, ratio: '4:3' },
  ),
  fashion: artwork(
    'hero-fashion',
    'sunny/gallery/fashion-doll.webp',
    '衣着，自有表达',
    '身穿薄荷绿西装的成年女性手作玩偶，站在暖阳海滨庭院中的 3D 时装概念图',
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
    'sunny/gallery/creative-atelier.webp',
    '一间想象力画室',
    '海滨画室内的小黄机器人、空白画架与薄荷绿拱窗，暖阳手作风 3D 插画',
    ['gallery', 'tools'],
  ),
  city: {
    id: 'ai-story-city',
    src: '/images/marketing/sunny/hero/coastal-creator.webp',
    title: '沿着阳光，展开想象',
    alt: '小黄机器人骑薄荷绿踏板车穿过鲜花与粉彩房屋环绕的海滨小镇，暖阳手作风 3D 插画',
    width: 1664,
    height: 936,
    ratio: '16:9',
    sections: ['hero', 'story', 'tools'],
    provenance: 'generated-concept',
    promptId: 'ai-story-city',
  } satisfies MarketingAsset,
  perfume: artwork(
    'ecommerce-perfume',
    'sunny/commerce/perfume.webp',
    '香水',
    '鹅黄球形瓶盖的薄荷绿香水瓶置于海滨窗边，暖阳手作风 3D 商品概念图',
    ['ecommerce', 'gallery', 'tools'],
  ),
  coffee: artwork(
    'ecommerce-coffee',
    'sunny/gallery/coffee-corner.webp',
    '咖啡',
    '鹅黄咖啡袋、薄荷绿咖啡杯和牛角面包构成的暖阳微缩咖啡角 3D 插画',
    ['ecommerce', 'gallery'],
  ),
  lifestyle: artwork(
    'ecommerce-lifestyle',
    'sunny/commerce/atelier-lamp.webp',
    '家居',
    '带有薄荷绿底座的鹅黄蘑菇台灯，置于暖阳画室书桌上的手作风 3D 商品图',
    ['ecommerce', 'tools'],
  ),
  accessory: artwork(
    'ecommerce-accessory',
    'sunny/gallery/little-handbag.webp',
    '配饰',
    '带有薄荷绿扣件的珊瑚桃色肩包置于花园长凳上，暖阳手作风 3D 商品图',
    ['ecommerce', 'gallery', 'tools'],
  ),
  cityDetail: {
    id: 'gallery-city',
    src: '/images/marketing/sunny/gallery/coastal-detail.webp',
    title: '小小旅程，大大想象',
    alt: '海滨小镇中骑着薄荷绿踏板车的小黄机器人，手作风 3D 主视觉的竖版裁切',
    width: 840,
    height: 1050,
    ratio: '4:5',
    sections: ['gallery'],
    provenance: 'derived-crop',
    promptId: 'ai-story-city',
    referenceId: 'ai-story-city',
  } satisfies MarketingAsset,
  social: {
    id: 'social-cover',
    src: '/images/marketing/sunny/hero/coastal-og.webp',
    title: 'iStudio 创作世界',
    alt: 'iStudio 官网暖阳海滨机器人手作风 3D 视觉概念分享图',
    width: 1200,
    height: 630,
    ratio: '40:21',
    sections: ['social'],
    provenance: 'derived-crop',
    promptId: 'ai-story-city',
    referenceId: 'ai-story-city',
  } satisfies MarketingAsset,
}

export const heroArtwork = marketingAssets.city
export const galleryAssets = [
  marketingAssets.fantasy,
  marketingAssets.perfume,
  marketingAssets.fashion,
  marketingAssets.stillLife,
  marketingAssets.cityDetail,
  marketingAssets.coffee,
  marketingAssets.future,
  marketingAssets.accessory,
]
export const productComparison = {
  before: marketingAssets.skincareBase,
  after: marketingAssets.skincare,
}
