import { z } from 'zod'

export const aspectRatioSchema = z.enum(['1:1', '3:4', '4:3', '9:16', '16:9'])
export const resolutionSchema = z.enum(['1K', '2K', '4K'])
export const generationModelSchema = z.string().trim().min(1, '模型不能为空').max(200, '模型名称过长').default('gpt-image-2')
export const generationCountSchema = z.number().int('生成数量必须为整数').min(1, '生成数量至少为 1 张').max(16, '一次最多生成 16 张').default(1)
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
  endpointId: z.string().trim().min(1).optional(),
  model: generationModelSchema.default('gpt-image-2'),
  aspectRatio: aspectRatioSchema.default('1:1'),
  resolution: resolutionSchema.default('2K'),
  count: generationCountSchema,
  projectId: z.string().trim().min(1, '项目 ID 不能为空').optional(),
})

const productAssetsSchema = z.array(z.string().min(1)).min(1, '请至少上传 1 张商品原图').max(6, '商品原图最多上传 6 张')
const referenceAssetsSchema = z.array(z.string().min(1)).max(6, '参考图最多上传 6 张').default([])
const moduleCountsSchema = z.record(z.string(), z.number().int('每个模块的张数必须为整数').min(1, '每个模块至少生成 1 张').max(4, '每个模块最多生成 4 张')).superRefine((counts, ctx) => {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  if (total > 16) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '自定义模块最多生成 16 张图片' })
  }
}).default({})

export const generalGenerationInputSchema = imageSettingsSchema.extend({
  mode: z.literal('general'),
  prompt: z.string().trim().min(1, '请先输入提示词').max(10000, '提示词过长，请精简到 10000 字以内'),
  referenceAssetIds: referenceAssetsSchema,
  style: z.enum(['unspecified', 'studio', 'minimal', 'fresh', 'technology', 'guochao', 'handdrawn']).default('unspecified'),
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
  requirements: z.string().trim().max(2000, '需求描述过长，请精简到 2000 字以内').default(''),
  outputLanguage: outputLanguageSchema.default('none'),
  moduleMode: z.enum(['smart', 'custom']).default('smart'),
  moduleCounts: moduleCountsSchema,
})

export const detailPageInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('detail-page'),
  requirements: z.string().trim().max(2000, '需求描述过长，请精简到 2000 字以内').default(''),
  outputLanguage: outputLanguageSchema.default('none'),
  moduleMode: z.enum(['smart', 'custom']).default('smart'),
  moduleCounts: moduleCountsSchema,
})

export const viralRecreateInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('viral-recreate'),
  referenceAssetIds: z.array(z.string().min(1)).length(1, '爆款复刻需要上传 1 张参考爆款图'),
  recreateStrength: z.enum(['style', 'high']).default('style'),
  requirements: z.string().trim().max(1000, '需求描述过长，请精简到 1000 字以内').default(''),
  outputLanguage: outputLanguageSchema.default('none'),
})

export const productRetouchInputSchema = commerceBaseSchema.extend({
  taskType: z.literal('product-retouch'),
  enhancements: z.array(z.enum(['gloss', 'repair', 'clarity', 'color', 'perspective', 'background'])).default([]),
  requirements: z.string().trim().max(1000, '需求描述过长，请精简到 1000 字以内').default(''),
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
