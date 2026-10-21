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
    'sunny-product',
    '为商品，找到它的光',
    '海滨窗边带有鹅黄球形瓶盖的薄荷绿香水瓶，暖阳手作风 3D 商品概念图',
    'ecommerce-perfume',
  ),
  retouch: artwork(
    'tool-retouch',
    'sunny-retouch',
    '让细节，更有分寸',
    '保留薄荷绿香水瓶、鹅黄瓶盖和海滨窗台，调整光影与材质的 3D 精修概念编辑图',
    'tool-product',
    'reference-image-edit',
  ),
  fashion: artwork(
    'tool-fashion',
    'sunny-fashion',
    '让服装，拥有表现力',
    '暖阳海滨庭院中身穿薄荷绿西装的成年女性手作玩偶，3D 服装展示概念图',
    'hero-fashion',
  ),
}
