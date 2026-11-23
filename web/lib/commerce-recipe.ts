import type { CommerceTaskType } from './contracts'
import { studioToolUrl, type StudioQuery } from './studio-navigation'

export const productMainRecipe = {
  id: 'product-main-trio',
  title: '商品上架套图',
  task: 'product-main',
  aspectRatio: '1:1',
  moduleCounts: { white: 1, scene: 1, detail: 1 },
  requirements:
    '整套使用同一件商品，保留原图中的外形、颜色、材质、标识和包装文字。每张只按当前图种取景。场景图沿用案例的暖调侧光和浅色台面，按商品用途选择陪衬，保持商品本色。',
} as const

export const detailPageRecipe = {
  id: 'detail-page-trio',
  title: '商品详情套图',
  task: 'detail-page',
  aspectRatio: '3:4',
  moduleCounts: { hero: 1, material: 1, scene: 1 },
  requirements:
    '整套采用暖色自然侧光和简洁的浅色背景，商品本身保持原图的外形、色泽、标识和包装文字。每张独立完成当前模块指定的取景，使用场景应符合商品的真实用途。',
} as const

export const clothingModelRecipe = {
  id: 'clothing-model-duo',
  title: '模特上身套图',
  task: 'clothing-set',
  aspectRatio: '3:4',
  moduleCounts: { 'clothing-model': 2 },
  requirements:
    '让同一位成年模特穿着用户提供的服装，保留原图可见的颜色、版型、印花和标识。两张都采用简洁的浅色摄影棚背景、柔和的暖调侧光和一致的取景尺度。根据服装长度安排取景，完整展示所选服装，需要搭配时使用素色基础款。',
  shots: [
    {
      id: 'clothing-model-1',
      moduleKey: 'clothing-model',
      label: '正面上身图',
      description:
        '模特正面朝向镜头，自然站立，双臂避开服装主体，完整展示正面版型、衣长和原图可见的细节。',
    },
    {
      id: 'clothing-model-2',
      moduleKey: 'clothing-model',
      label: '侧面上身图',
      description:
        '拍严格的 90 度正侧面。相机从与胸口朝向垂直的位置平视拍摄，模特的双脚、髋部、胸口和鼻尖都朝画面左边，视线平视画外。画面只见一侧脸的轮廓，近侧肩与远侧肩在画面上重叠。衣身侧面占主要面积，前中线仅在轮廓边缘可见。近侧手臂略向后让出衣身，完整展示服装侧面轮廓和垂坠。首张成片只供对齐模特与穿搭，本张使用相同取景尺度。',
    },
  ],
} as const

const commerceRecipes = [productMainRecipe, detailPageRecipe, clothingModelRecipe] as const
export type CommerceRecipe = (typeof commerceRecipes)[number]

export function getCommerceRecipe(id: string | null | undefined) {
  return commerceRecipes.find((recipe) => recipe.id === id)
}

export function getCommerceRecipeForTask(task: CommerceTaskType) {
  return commerceRecipes.find((recipe) => recipe.task === task)
}

export function commerceRecipeUrl(recipe: CommerceRecipe, source?: StudioQuery | null) {
  return `${studioToolUrl('commerce', recipe.task, source)}&recipe=${recipe.id}`
}
