import type { CommerceRecipe } from './commerce-recipe'

interface ExampleImage {
  src: string
  width: number
  height: number
  label: string
  alt: string
}

function exampleImage(
  name: string,
  label: string,
  alt: string,
  width: number,
  height: number,
): ExampleImage {
  return { src: `/images/commerce/recipes/${name}.webp`, width, height, label, alt }
}

export const commerceRecipeExamples = {
  'product-main-trio': {
    source: exampleImage('product-main-source', '商品原图', '灰色背景上的米白面霜罐', 900, 607),
    outputs: [
      exampleImage('product-main-white', '白底主图', '白底上完整展示的米白面霜罐', 640, 640),
      exampleImage('product-main-scene', '场景主图', '暖光洗漱台上的面霜罐', 640, 640),
      exampleImage('product-main-detail', '细节主图', '面霜罐盖缝和黑色标记特写', 640, 640),
    ],
  },
  'detail-page-trio': {
    source: exampleImage('detail-page-source', '商品原图', '灰色背景上的绿色滴管瓶', 450, 600),
    outputs: [
      exampleImage('detail-page-hero', '首屏主视觉', '斜射暖光下完整展示的绿色滴管瓶', 480, 640),
      exampleImage('detail-page-material', '材质纹理图', '绿色玻璃瓶肩和浅色标签特写', 480, 640),
      exampleImage('detail-page-scene', '场景应用图', '浅色台面上搭配毛巾和绿植的滴管瓶', 480, 640),
    ],
  },
  'clothing-model-duo': {
    source: exampleImage('clothing-set-source', '服装原图', '平铺的米白短袖开领衬衫', 591, 887),
    outputs: [
      exampleImage(
        'clothing-set-front',
        '正面上身图',
        '模特穿着米白短袖从正面展示开领和门襟',
        480,
        640,
      ),
      exampleImage(
        'clothing-set-side',
        '侧面上身图',
        '同一位模特侧身展示衬衫的版型和垂坠',
        480,
        640,
      ),
    ],
  },
} satisfies Record<
  CommerceRecipe['id'],
  { source: ExampleImage; outputs: [ExampleImage, ...ExampleImage[]] }
>

export const commerceComparisonExamples = {
  'product-retouch': {
    src: '/images/commerce/retouch.webp',
    ratio: 3 / 2,
    before: { alt: '金属杯精修前示例', label: '精修前' },
    after: { alt: '同款金属杯精修后示例', label: '精修后' },
  },
  'viral-recreate': {
    src: '/images/commerce/recreate.webp',
    ratio: 2 / 3,
    before: { alt: '蓝色商品的参考构图示例', label: '参考版式' },
    after: { alt: '将参考构图应用到橙色商品的示例', label: '套用商品' },
  },
} as const
