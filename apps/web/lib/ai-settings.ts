import { apiBaseUrl, getAccessToken, readApiError } from './api'

export type EndpointPurpose = 'prompt' | 'image'
export type AIProtocol = 'openai_chat' | 'openai_image' | 'gemini_generate_content'
export interface AIEndpoint {
  id: string
  name: string
  purpose: EndpointPurpose
  protocol: AIProtocol
  baseUrl: string
  model: string
  timeoutSeconds: number
  capabilities: Record<string, boolean>
  enabled: boolean
  isDefault: boolean
  apiKeyConfigured: boolean
  apiKeyMasked: string
}
export type EndpointInput = Omit<AIEndpoint, 'id' | 'apiKeyConfigured' | 'apiKeyMasked'> & { apiKey?: string }
export interface PromptTemplate {
  key: string
  name: string
  category: string
  content: string
  defaultContent: string
  enabled: boolean
  sortOrder: number
}
export interface AIConnectionTest { success: boolean; model: string; responseTimeMs: number; message: string }
export async function settingsRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${getAccessToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(await readApiError(response, '请求失败，请重试'))
  return response.json() as Promise<T>
}
