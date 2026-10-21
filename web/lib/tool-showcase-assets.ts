import type { MarketingAsset } from './marketing-assets'

function artwork(
  id: string,
  filename: string,
  title: string,
  alt: string,
  referenceId: string,
  provenance: MarketingAsset['provenance'] = 'derived-crop',
) {
  return {
    id,
    src: `/images/marketing/tool-showcase/${filename}.webp`,
    title,
    alt,
    width: 1280,
    height: 960,
    ratio: '4:3',
    sections: ['tools'],
    provenance,
    promptId: id,
    ...(referenceId ? { referenceId } : {}),
  } satisfies MarketingAsset
}

export const showcaseAssets = {
  generator: artwork(
    'tool-generator',
    'sunny-generator',
    '把想象，写进光里',
    '微缩海滨画室门前的小机器人与花朵，暖阳手作风 3D 建筑概念作品',
    'hero-fantasy',
  ),
  prompt: artwork(
    'tool-prompt',
    'sunny-prompt',
    '从画面，找到语言',
    '薄荷绿陶瓷花瓶、白色雏菊与珊瑚色小鸟，暖阳手作风 3D 静物概念图',
    'hero-still-life',
  ),
  product: artwork(
    'tool-product',
    'chromatic-product',
    '为商品，找到它的光',
    '蓝色香水瓶与金属球盖置于橙色展台上的写实商品图',
    'ecommerce-perfume',
  ),
  retouch: artwork(
    'tool-retouch',
    'chromatic-retouch',
    '让细节，更有分寸',
    '保留蓝色香水瓶与橙色展台，调整金属球盖反射与光影的精修图',
    'tool-product',
    'reference-image-edit',
  ),
  fashion: artwork(
    'tool-fashion',
    'chromatic-fashion',
    '让服装，拥有表现力',
    '身穿蓝色西装行走在橙色庭院中的服装模特图',
    'hero-fashion',
  ),
}
