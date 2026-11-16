import { z } from 'zod'
import { apiBaseUrl, readApiError } from './api'
import { fillPromptVariables } from './personal-prompts'

export const inspirationTemplateSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(160),
  prompt: z.string().min(1).max(20000),
  instructions: z.string().max(10000).optional().default(''),
  requiresReference: z.boolean().optional().default(false),
})

/** Only the instructions cross into creation; the public cover is never a reference asset. */
export type InspirationTemplate = z.infer<typeof inspirationTemplateSchema>

export function inspirationTemplate(value: unknown): InspirationTemplate {
  const parsed = inspirationTemplateSchema.safeParse(value)
  if (!parsed.success) throw new Error('灵感模板内容不完整，请重新选择')
  return parsed.data
}

export function inspirationWorkbenchUrl(id: string) {
  return `/studio?${new URLSearchParams({ mode: 'general', inspirationId: id })}`
}

export async function readInspirationTemplate(id: string, signal: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}/v1/inspiration/prompts/${encodeURIComponent(id)}`, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
  })
  if (!response.ok)
    throw new Error(await readApiError(response, '灵感模板读取失败，请重试或重新选择'))
  const data = (await response.json()) as { prompt?: unknown }
  const template = inspirationTemplate(data.prompt)
  if (template.id !== id) throw new Error('灵感模板不匹配，请重新选择')
  return template
}

export function applyInspirationVariables(
  template: InspirationTemplate,
  values: Record<string, string>,
): InspirationTemplate {
  const prompt = fillPromptVariables(template.prompt, values)
  if (prompt.length > 10000) throw new Error('填入变量后的描述超过 10000 字，请精简变量后再应用')
  return { ...template, prompt }
}
