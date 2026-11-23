import { studioToolUrl, type StudioQuery } from './studio-navigation'

export const productMainRecipe = {
  id: 'product-main-trio',
  title: '商品上架套图',
  task: 'product-main',
  aspectRatio: '1:1',
  moduleCounts: { white: 1, scene: 1, detail: 1 },
  requirements:
    '整套使用同一件商品，保留原图中的外形、颜色、材质、标识和包装文字。白底主图完整展示商品，主体居中，保留自然接触阴影。场景主图沿用案例的暖调侧光和浅色台面，按商品用途选择陪衬，突出商品本身。细节主图近摄原图中可见的材质或工艺。',
} as const

export function getCommerceRecipe(id: string | null | undefined) {
  return id === productMainRecipe.id ? productMainRecipe : undefined
}

export function productMainRecipeUrl(source?: StudioQuery | null) {
  return `${studioToolUrl('commerce', productMainRecipe.task, source)}&recipe=${productMainRecipe.id}`
}
