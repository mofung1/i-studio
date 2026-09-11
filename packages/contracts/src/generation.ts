import { z } from 'zod'

export const aspectRatioSchema = z.enum(['1:1', '3:4', '4:3', '9:16', '16:9'])
export const resolutionSchema = z.enum(['1K', '2K', '4K'])
export const generationModelSchema = z.enum([
  'gpt-image-2',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
])
export const generationCountSchema = z.number().int().min(1).max(4).default(1)
export const platformSchema = z.enum([
  'taobao-tmall',
  'jd',
  'pinduoduo',
  'douyin',
  'xiaohongshu',
  'amazon',
  'shopify',
  'generic',
])
export const outputLanguageSchema = z.enum(['zh-CN', 'zh-TW', 'en'])

const imageSettingsSchema = z.object({
  model: generationModelSchema.default('gpt-image-2'),
  aspectRatio: aspectRatioSchema.default('1:1'),
  resolution: resolutionSchema.default('2K'),
  count: generationCountSchema,
  projectId: z.string().trim().min(1).optional(),
})

const productAssetsSchema = z.array(z.string().min(1)).min(1).max(10)
const referenceAssetsSchema = z.array(z.string().min(1)).max(4).default([])
const sellingPointsSchema = z.array(z.string().trim().min(1).max(50)).max(8)

export const generalGenerationInputSchema = imageSettingsSchema.extend({
  mode: z.literal('general'),
  prompt: z.string().trim().min(1).max(4000),
  referenceAssetIds: referenceAssetsSchema,
  style: z.enum(['unspecified', 'studio', 'minimal', 'fresh', 'technology', 'guochao']).default('unspecified'),
  referenceStrength: z.enum(['low', 'medium', 'high']).default('medium'),
})

const commerceBaseSchema = imageSettingsSchema.extend({
  mode: z.literal('commerce'),
  productAssetIds: productAssetsSchema,
  productName: z.string().trim().min(1).max(100),
  productCategory: z.string().trim().min(1).max(100),
  platform: platformSchema.default('generic'),
  consistencyProtection: z.boolean().default(true),
})

export const whiteBackgroundInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('white-background'),
  requirements: z.string().trim().max(1000).default(''),
  naturalShadow: z.boolean().default(true),
})

export const sceneGenerationInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('scene'),
  sceneDescription: z.string().trim().min(1).max(1000),
  referenceAssetIds: referenceAssetsSchema,
  visualDirection: z.array(z.enum(['composition', 'color', 'material', 'lighting', 'style', 'atmosphere'])).default([]),
})

export const sellingPointInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('selling-point'),
  sellingPoints: sellingPointsSchema.min(1),
  outputLanguage: outputLanguageSchema.default('zh-CN'),
  requirements: z.string().trim().max(1000).default(''),
  reserveCopyArea: z.boolean().default(true),
})

export const detailPageInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('detail-page'),
  module: z.enum(['hero', 'core-selling-point', 'usage-scene', 'multi-angle', 'specification', 'material', 'accessories']),
  sellingPoints: sellingPointsSchema.default([]),
  outputLanguage: outputLanguageSchema.default('zh-CN'),
  requirements: z.string().trim().max(1000).default(''),
})

export const commerceGenerationInputSchema = z.discriminatedUnion('taskType', [
  whiteBackgroundInputSchema,
  sceneGenerationInputSchema,
  sellingPointInputSchema,
  detailPageInputSchema,
])

export const generationInputSchema = z.union([
  generalGenerationInputSchema,
  commerceGenerationInputSchema,
])

export type GeneralGenerationInput = z.infer<typeof generalGenerationInputSchema>
export type CommerceGenerationInput = z.infer<typeof commerceGenerationInputSchema>
export type GenerationInput = z.infer<typeof generationInputSchema>
export type GenerationModel = z.infer<typeof generationModelSchema>
export type CommerceTaskType = CommerceGenerationInput['taskType']

export const commerceTaskCapabilities = {
  'white-background': {
    title: '白底精修',
    required: ['productAssetIds', 'productName', 'productCategory'],
    optional: ['platform', 'requirements', 'naturalShadow'],
  },
  scene: {
    title: '商品场景图',
    required: ['productAssetIds', 'productName', 'productCategory', 'sceneDescription'],
    optional: ['platform', 'referenceAssetIds', 'visualDirection'],
  },
  'selling-point': {
    title: '卖点主图',
    required: ['productAssetIds', 'productName', 'productCategory', 'sellingPoints'],
    optional: ['platform', 'outputLanguage', 'requirements', 'reserveCopyArea'],
  },
  'detail-page': {
    title: '详情页单页',
    required: ['productAssetIds', 'productName', 'productCategory', 'module'],
    optional: ['platform', 'sellingPoints', 'outputLanguage', 'requirements'],
  },
} as const satisfies Record<CommerceTaskType, { title: string; required: readonly string[]; optional: readonly string[] }>
