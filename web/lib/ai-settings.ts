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
export type EndpointInput = Omit<AIEndpoint, 'id' | 'apiKeyConfigured' | 'apiKeyMasked'> & {
  apiKey?: string
}
export interface PromptTemplate {
  key: string
  name: string
  category: string
  content: string
  defaultContent: string
  enabled: boolean
  sortOrder: number
  description?: string
  variables?: string[]
}
export interface AIConnectionTest {
  success: boolean
  model: string
  responseTimeMs: number
  message: string
}
