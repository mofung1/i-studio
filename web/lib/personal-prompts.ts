import { z } from 'zod'
import { reverseStorageKey } from './prompt-reverse'
import { libraryRequest } from './library'
import {
  aspectRatioSchema,
  resolutionSchema,
  platformSchema,
  outputLanguageSchema,
  type CommerceTaskType,
} from './contracts'

const presetSchema = z.object({
  mode: z.enum(['general', 'commerce']),
  taskType: z
    .enum(['product-main', 'detail-page', 'viral-recreate', 'product-retouch', 'clothing-set'])
    .optional(),
  model: z.string().min(1).max(200),
  endpointId: z.string().max(100).optional(),
  aspectRatio: aspectRatioSchema,
  resolution: resolutionSchema,
  count: z.number().int().min(1).max(16),
  style: z
    .enum(['unspecified', 'studio', 'minimal', 'fresh', 'technology', 'guochao', 'handdrawn'])
    .optional(),
  referenceStrength: z.enum(['low', 'medium', 'high']).optional(),
  platform: platformSchema.optional(),
  outputLanguage: outputLanguageSchema.optional(),
  moduleMode: z.enum(['smart', 'custom']).optional(),
  moduleCounts: z.record(z.string(), z.number().int().min(1).max(4)).optional(),
  recreateStrength: z.enum(['style', 'high']).optional(),
  enhancements: z
    .array(z.enum(['gloss', 'repair', 'clarity', 'color', 'perspective', 'background']))
    .optional(),
  clothingMode: z.enum(['product', 'model']).optional(),
  clothingStyle: z.enum(['studio', 'natural', 'street', 'editorial']).optional(),
})
export type CreationPreset = z.infer<typeof presetSchema>
export interface PersonalPrompt {
  id: string
  kind: 'prompt' | 'preset'
  title: string
  category: string
  prompt: string
  tags: string[]
  favorite: boolean
  config: Partial<CreationPreset>
  source: string
  version: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}
export interface PromptVersion {
  version: number
  snapshot: PersonalPrompt
  createdAt: string
}
export interface PersonalApplication {
  text: string
  config?: CreationPreset
  title: string
}

export function promptVariables(prompt: string) {
  return [
    ...new Set(
      [...prompt.matchAll(/{{\s*([^{}]{1,32})\s*}}/g)]
        .map((match) => match[1]!.trim())
        .filter(Boolean),
    ),
  ]
}
export function fillPromptVariables(prompt: string, values: Record<string, string>) {
  const variables = promptVariables(prompt)
  if (variables.length > 20) throw new Error('一个提示词最多支持 20 个变量')
  if (variables.some((name) => !values[name]?.trim())) throw new Error('请填写全部变量')
  return prompt.replace(/{{\s*([^{}]{1,32})\s*}}/g, (_match, name: string) =>
    values[name.trim()]!.trim(),
  )
}
export function validatePreset(value: unknown): CreationPreset {
  const result = presetSchema.safeParse(value)
  if (!result.success) throw new Error('预设参数不完整或已失效，请在工作台调整后重新保存')
  if (result.data.mode === 'commerce' && !result.data.taskType)
    throw new Error('电商预设缺少工具类型')
  if (result.data.mode === 'general' && result.data.count > 4)
    throw new Error('通用生图一次最多 4 张')
  return result.data
}
export function applicationFor(
  item: PersonalPrompt,
  values: Record<string, string>,
): PersonalApplication {
  const text = fillPromptVariables(item.prompt, values)
  const config = item.kind === 'preset' ? validatePreset(item.config) : undefined
  const maximum =
    config?.mode === 'commerce'
      ? ['viral-recreate', 'product-retouch'].includes(config.taskType ?? '')
        ? 1000
        : 2000
      : 10000
  if (text.length > maximum) throw new Error(`填入变量后的描述超过 ${maximum} 字，请精简后再应用`)
  return { text, config, title: item.title }
}
export function personalWorkbenchURL(item: PersonalPrompt, values: Record<string, string> = {}) {
  const application = applicationFor(item, values)
  const nonce = crypto.randomUUID()
  sessionStorage.setItem(
    reverseStorageKey(`creation-handoff:${nonce}`),
    JSON.stringify({
      id: item.id,
      version: item.version,
      text: application.text,
      expiresAt: Date.now() + 10 * 60 * 1000,
    }),
  )
  const query = new URLSearchParams({
    mode: application.config?.mode ?? 'general',
    collectionId: item.id,
    collectionHandoff: nonce,
  })
  if (application.config?.mode === 'commerce')
    query.set('task', application.config.taskType as CommerceTaskType)
  return `/studio?${query}`
}
export async function readPersonalApplication(
  id: string,
  nonce: string | null,
  signal: AbortSignal,
) {
  const { item } = await libraryRequest<{ item: PersonalPrompt }>(
    `personal/prompts/${encodeURIComponent(id)}`,
    { signal },
  )
  let text = item.prompt
  if (nonce) {
    const key = reverseStorageKey(`creation-handoff:${nonce}`)
    const raw = sessionStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw) as {
        id: string
        version: number
        text: string
        expiresAt: number
      }
      if (saved.id !== item.id || saved.version !== item.version || saved.expiresAt < Date.now())
        throw new Error('提示词已更新或应用已过期，请重新选择')
      text = saved.text
      // The caller consumes this only after its current route request is applied.
    }
  }
  if (promptVariables(text).length)
    throw new Error('这条提示词需要填写变量，请从“我的提示词”重新应用')
  const application = applicationFor({ ...item, prompt: text }, {})
  return application
}
export function presetDescription(config: Partial<CreationPreset>) {
  const labels: Record<string, string> = {
    'product-main': '商品主图',
    'detail-page': '商品详情',
    'viral-recreate': '爆款复刻',
    'product-retouch': '产品精修',
    'clothing-set': '服装组图',
  }
  return [
    config.mode === 'commerce' ? labels[config.taskType ?? ''] : 'AI 生图',
    config.model,
    config.aspectRatio,
    config.resolution,
    config.count ? `${config.count} 张` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
export function resolvePresetEndpoint(
  config: CreationPreset,
  endpoints: Array<{ id: string; model: string }>,
) {
  const endpoint =
    endpoints.find(
      (item) =>
        item.id === config.endpointId &&
        (item.id.startsWith('model_') || item.model === config.model),
    ) ?? endpoints.find((item) => item.model === config.model)
  if (!endpoint) throw new Error(`预设模型 ${config.model} 暂不可用，请联系管理员确认模型上架状态`)
  return endpoint
}
