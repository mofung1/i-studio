export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'

export interface ApiErrorPayload {
  code?: string
  message?: string
}

export function getAccessToken() {
  return window.localStorage.getItem('istudio-access-token') ?? ''
}

export async function readApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as ApiErrorPayload
    return payload.message ?? fallback
  } catch {
    return fallback
  }
}

export async function uploadAsset(file: File, token: string) {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${apiBaseUrl}/v1/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (!response.ok) throw new Error(await readApiError(response, '图片上传失败'))

  const payload = await response.json() as { asset?: { id?: string } }
  if (!payload.asset?.id) throw new Error('图片上传响应不完整')
  return payload.asset.id
}

export type PromptEnhanceTarget = 'prompt' | 'requirements'

export interface PromptEnhanceInput {
  target: PromptEnhanceTarget
  /** 用户当前输入；与 files 至少有一个 */
  text: string
  files?: File[]
  context?: {
    taskType?: string
    platform?: string
    style?: string
    /** 模块模式与已选模块（仅电商主图 / 详情页），用于让 AI 知道这组图要表达什么 */
    moduleMode?: string
    /** 可读模块名（模块名×张数），服务端不认识也能正常展示 */
    modules?: string[]
    /** 与 modules 一一对应的模块 key（key×张数），服务端据此补上模块表达要点 */
    moduleKeys?: string[]
    outputLanguage?: string
    recreateStrength?: string
    enhancements?: string[]
  }
}

export interface PromptEnhanceResult {
  text: string
  model?: string
}

/** 删除一条生成记录（连同它生成的结果图片）。 */
export async function deleteGenerationTask(taskId: string) {
  const token = getAccessToken()
  const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${taskId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (response.status === 401) throw new Error('登录状态已失效，请重新登录')
  if (!response.ok) throw new Error(await readApiError(response, '删除失败，请稍后重试'))
}

/** 删除资产库里的一张生成图片；contentPath 形如 /v1/assets/{id}/content。 */
export async function deleteGeneratedAsset(contentPath: string) {
  const token = getAccessToken()
  const response = await fetch(`${apiBaseUrl}${contentPath.replace(/\/content$/, '')}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (response.status === 401) throw new Error('登录状态已失效，请重新登录')
  if (!response.ok) throw new Error(await readApiError(response, '删除失败，请稍后重试'))
}

/** AI 优化提示词 / AI 帮写：走后端代理调用 DeepSeek，前端不接触密钥。 */
export async function enhancePrompt({ target, text, files = [], context }: PromptEnhanceInput): Promise<PromptEnhanceResult> {
  const body = new FormData()
  body.append('target', target)
  body.append('text', text)
  if (context?.taskType) body.append('taskType', context.taskType)
  if (context?.platform) body.append('platform', context.platform)
  if (context?.style) body.append('style', context.style)
  if (context?.moduleMode) body.append('moduleMode', context.moduleMode)
  for (const item of context?.modules ?? []) body.append('modules', item)
  for (const item of context?.moduleKeys ?? []) body.append('moduleKeys', item)
  if (context?.outputLanguage) body.append('outputLanguage', context.outputLanguage)
  if (context?.recreateStrength) body.append('recreateStrength', context.recreateStrength)
  for (const item of context?.enhancements ?? []) body.append('enhancements', item)
  for (const file of files) body.append('images', file)

  const token = getAccessToken()
  const response = await fetch(`${apiBaseUrl}/v1/prompts/enhance`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  })
  if (response.status === 401) throw new Error('登录状态已失效，请重新登录')
  if (!response.ok) throw new Error(await readApiError(response, 'AI 处理失败，请稍后重试'))
  const payload = await response.json() as PromptEnhanceResult
  if (!payload.text) throw new Error('AI 没有返回内容，请重试')
  return payload
}
