import { z } from 'zod'
import { frontendRequest } from './frontend-request'

export const productPurposes = [
  { value: 'main', label: '商品主图', description: '突出商品主体，适合上架展示' },
  { value: 'scene', label: '使用场景', description: '把商品放进合适的生活场景' },
  { value: 'detail', label: '商品细节', description: '展示材质、结构与局部特征' },
  { value: 'selling-point', label: '卖点配图', description: '围绕已确认的卖点组织画面' },
] as const
export type ProductPurpose = (typeof productPurposes)[number]['value']

export const productDraftSchema = z
  .object({
    name: z.string().max(120).default(''),
    description: z.string().max(2000).default(''),
    sellingPoints: z.string().max(2000).default(''),
    preserveDetails: z.string().max(2000).default(''),
    productAssetIds: z.array(z.string().min(1)).max(6).default([]),
    referenceAssetIds: z.array(z.string().min(1)).max(6).default([]),
    projectId: z.string().default(''),
    version: z.number().int().positive().optional(),
  })
  .refine((value) => value.productAssetIds.length + value.referenceAssetIds.length <= 6, {
    message: '商品原图和风格参考合计最多 6 张',
  })

export type ProductDraft = z.infer<typeof productDraftSchema>
export interface CommerceProduct extends ProductDraft {
  id: string
  version: number
  adoptedAssetIds: Partial<Record<ProductPurpose, string>>
  createdAt: string
  updatedAt: string
}
export interface ProductVersion {
  assetId: string
  contentPath: string
  thumbnailPath: string
  taskId: string
  purpose: ProductPurpose
  parentAssetId: string
  productVersion: number
  adopted: boolean
  createdAt: string
  width: number
  height: number
  sizeBytes: number
}
export interface ProductAnalysis {
  analysis: Pick<ProductDraft, 'description' | 'sellingPoints' | 'preserveDetails'>
  model?: string
  warnings: string[]
}

const path = 'commerce/products'
export const productApi = {
  list: (query: URLSearchParams, signal?: AbortSignal) =>
    frontendRequest<{
      products: CommerceProduct[]
      total: number
      nextCursor: string
    }>(`${path}?${query}`, { signal }, '商品档案读取失败，请重试'),
  get: (id: string) =>
    frontendRequest<{ product: CommerceProduct }>(`${path}/${encodeURIComponent(id)}`),
  save: (draft: ProductDraft, id?: string) =>
    frontendRequest<{ product: CommerceProduct }>(
      `${path}${id ? `/${encodeURIComponent(id)}` : ''}`,
      {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      },
      '商品档案保存失败，草稿已保留',
    ),
  analyze: (draft: ProductDraft) =>
    frontendRequest<ProductAnalysis>(
      `${path}/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      },
      '商品分析失败，可以继续手动填写',
    ),
  versions: (id: string, cursor = '', signal?: AbortSignal) =>
    frontendRequest<{
      versions: ProductVersion[]
      total: number
      nextCursor: string
    }>(
      `${path}/${encodeURIComponent(id)}/versions?${new URLSearchParams({ limit: '24', cursor })}`,
      { signal },
      '图片版本读取失败，请重试',
    ),
  adopt: (id: string, assetId: string) =>
    frontendRequest<{ product: CommerceProduct }>(
      `${path}/${encodeURIComponent(id)}/adopt`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      },
      '采用版本保存失败，请重试',
    ),
}

export function productFields(product?: ProductDraft): ProductDraft {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    sellingPoints: product?.sellingPoints ?? '',
    preserveDetails: product?.preserveDetails ?? '',
    productAssetIds: product?.productAssetIds ?? [],
    referenceAssetIds: product?.referenceAssetIds ?? [],
    projectId: product?.projectId ?? '',
    ...(product?.version ? { version: product.version } : {}),
  }
}
export function productDraftKey(owner: string, id?: string, projectId = '') {
  return `istudio-product-draft:${encodeURIComponent(owner)}:${encodeURIComponent(id ?? `new${projectId ? `@${projectId}` : ''}`)}`
}
export function restoreProductDraft(
  owner: string,
  product?: CommerceProduct,
  projectId = '',
): ProductDraft {
  try {
    const parsed = productDraftSchema.safeParse(
      JSON.parse(localStorage.getItem(productDraftKey(owner, product?.id, projectId)) ?? 'null'),
    )
    if (parsed.success) return parsed.data
  } catch {
    /* Corrupt or unavailable browser storage must not hide a saved product. */
  }
  return product ? productFields(product) : { ...productFields(), projectId }
}
export function sameProductFields(left: ProductDraft, right: ProductDraft) {
  const { version: _left, ...a } = productFields(left)
  const { version: _right, ...b } = productFields(right)
  return JSON.stringify(a) === JSON.stringify(b)
}
export function productPurposeLabel(value: string) {
  return productPurposes.find((item) => item.value === value)?.label ?? '商品图片'
}

const productCreationDraftSchema = z.object({
  purpose: z.enum(['main', 'scene', 'detail', 'selling-point']).default('main'),
  instructions: z.string().max(2000).default(''),
  modelId: z.string().default(''),
  aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).default('1:1'),
  resolution: z.enum(['1K', '2K', '4K']).default('1K'),
  count: z.number().int().min(1).max(4).default(1),
})
export function productCreationDraftKey(owner: string, id: string) {
  return `istudio-product-creation:${encodeURIComponent(owner)}:${encodeURIComponent(id)}`
}
export function restoreProductCreationDraft(owner: string, id: string) {
  try {
    const parsed = productCreationDraftSchema.safeParse(
      JSON.parse(localStorage.getItem(productCreationDraftKey(owner, id)) ?? 'null'),
    )
    if (parsed.success) return parsed.data
  } catch {
    /* Keep creation available if browser storage is unavailable. */
  }
  return productCreationDraftSchema.parse({})
}
