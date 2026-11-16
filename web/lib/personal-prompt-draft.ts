import { z } from 'zod'
import { presetDraftSchema } from './personal-prompts'

export const personalPromptDraftSchema = z.object({
  title: z.string().max(160),
  category: z.string().max(80),
  prompt: z.string().max(10000),
  tags: z.string().max(400),
  favorite: z.boolean(),
  config: presetDraftSchema,
  newCategory: z.boolean(),
})
export type PersonalPromptDraft = z.infer<typeof personalPromptDraftSchema>

const envelopeSchema = z.object({
  version: z.literal(1),
  baseline: z.string(),
  value: personalPromptDraftSchema,
})

export function personalPromptDraftKey(owner: string, identity: string, baseline: string) {
  // Keep keys short; the full baseline in the envelope also guards against hash collisions.
  let hash = 2166136261
  for (let index = 0; index < baseline.length; index++) {
    hash = Math.imul(hash ^ baseline.charCodeAt(index), 16777619)
  }
  return `istudio-prompt-draft:v1:${encodeURIComponent(owner)}:${encodeURIComponent(identity)}:${hash >>> 0}`
}

export function readPersonalPromptDraft(key: string, baseline: string) {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const parsed = envelopeSchema.safeParse(JSON.parse(raw))
  if (!parsed.success || parsed.data.baseline !== baseline)
    throw new Error('本地草稿无法读取，请保留当前内容后重新保存')
  return parsed.data.value
}

export function writePersonalPromptDraft(
  key: string,
  baseline: string,
  value: PersonalPromptDraft,
) {
  const validated = personalPromptDraftSchema.parse(value)
  localStorage.setItem(key, JSON.stringify({ version: 1, baseline, value: validated }))
}
