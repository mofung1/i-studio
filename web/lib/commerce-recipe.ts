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

export const detailPageRecipe = {
  id: 'detail-page-trio',
  title: '商品详情套图',
  task: 'detail-page',
  aspectRatio: '3:4',
  moduleCounts: { hero: 1, material: 1, scene: 1 },
  requirements:
    '整套采用暖色自然侧光，以商品原图为准，保持外形、颜色、标识和包装文字一致。首屏主视觉完整展示商品，以浅色台面和简洁背景突出主体。材质纹理图近摄原图可见的表面质感或工艺。场景应用图将商品放在符合其真实用途的环境中，陪衬与光线延续首屏风格。',
} as const

const commerceRecipes = [productMainRecipe, detailPageRecipe] as const
export type CommerceRecipe = (typeof commerceRecipes)[number]

export function getCommerceRecipe(id: string | null | undefined) {
  return commerceRecipes.find((recipe) => recipe.id === id)
}

export function commerceRecipeUrl(recipe: CommerceRecipe, source?: StudioQuery | null) {
  return `${studioToolUrl('commerce', recipe.task, source)}&recipe=${recipe.id}`
}
