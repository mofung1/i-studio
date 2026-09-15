import { z } from 'zod'

export const aspectRatioSchema = z.enum(['1:1', '3:4', '4:3', '9:16', '16:9'])
export const resolutionSchema = z.enum(['1K', '2K', '4K'])
export const generationModelSchema = z.enum([
  'gpt-image-2',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
])
export const generationCountSchema = z.number().int().min(1).max(16).default(1)
export const platformSchema = z.enum([
  'smart',
  'taobao',
  '1688',
  'tmall',
  'pinduoduo',
  'jd',
  'douyin',
  'amazon',
  'temu',
  'ebay',
])
export const outputLanguageSchema = z.enum(['none', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'th', 'ms', 'id', 'ru'])

const imageSettingsSchema = z.object({
  model: generationModelSchema.default('gpt-image-2'),
  aspectRatio: aspectRatioSchema.default('1:1'),
  resolution: resolutionSchema.default('2K'),
  count: generationCountSchema,
  projectId: z.string().trim().min(1).optional(),
})

const productAssetsSchema = z.array(z.string().min(1)).min(1).max(6)
const referenceAssetsSchema = z.array(z.string().min(1)).max(6).default([])
const moduleCountsSchema = z.record(z.string(), z.number().int().min(1).max(4)).default({})

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
  platform: platformSchema.default('smart'),
  consistencyProtection: z.boolean().default(true),
})

export const productMainInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('product-main'),
  requirements: z.string().trim().max(2000).default(''),
  outputLanguage: outputLanguageSchema.default('none'),
  moduleMode: z.enum(['smart', 'custom']).default('smart'),
  moduleCounts: moduleCountsSchema,
})

export const detailPageInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('detail-page'),
  requirements: z.string().trim().max(2000).default(''),
  outputLanguage: outputLanguageSchema.default('none'),
  moduleMode: z.enum(['smart', 'custom']).default('smart'),
  moduleCounts: moduleCountsSchema,
})

export const viralRecreateInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('viral-recreate'),
  referenceAssetIds: z.array(z.string().min(1)).length(1),
  recreateStrength: z.enum(['style', 'high']).default('style'),
  requirements: z.string().trim().max(1000).default(''),
  outputLanguage: outputLanguageSchema.default('none'),
})

export const productRetouchInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('product-retouch'),
  enhancements: z.array(z.enum(['gloss', 'repair', 'clarity', 'color', 'perspective', 'background'])).default([]),
  requirements: z.string().trim().max(1000).default(''),
})

export const commerceGenerationInputSchema = z.discriminatedUnion('taskType', [
  productMainInputSchema,
  detailPageInputSchema,
  viralRecreateInputSchema,
  productRetouchInputSchema,
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
  'product-main': { title: '商品主图', required: ['productAssetIds'], optional: ['platform', 'outputLanguage', 'moduleMode', 'moduleCounts', 'requirements'] },
  'detail-page': { title: '详情页', required: ['productAssetIds'], optional: ['platform', 'outputLanguage', 'moduleMode', 'moduleCounts', 'requirements'] },
  'viral-recreate': { title: '爆款复刻', required: ['productAssetIds', 'referenceAssetIds'], optional: ['platform', 'outputLanguage', 'recreateStrength', 'requirements'] },
  'product-retouch': { title: '产品精修', required: ['productAssetIds'], optional: ['platform', 'enhancements', 'requirements'] },
} as const satisfies Record<CommerceTaskType, { title: string; required: readonly string[]; optional: readonly string[] }>
