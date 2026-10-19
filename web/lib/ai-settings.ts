export type EndpointPurpose = 'prompt' | 'image'
export type AIProtocol = 'openai_chat' | 'openai_images' | 'gemini_native'
export interface AIEndpoint {
  id: string
  updatedAt?: string
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

export const imageProtocolLabels: Record<AIProtocol, string> = {
  openai_images: 'OpenAI 图片接口',
  openai_chat: 'Chat 多模态图片接口',
  gemini_native: 'Gemini 原生接口',
}

export const imageProtocolHelp: Record<AIProtocol, { description: string; baseUrl: string }> = {
  openai_images: {
    description: '用于 OpenAI 官方或兼容 Images API 的中转站，支持生成与参考图编辑。',
    baseUrl: 'https://api.openai.com/v1',
  },
  openai_chat: {
    description: '用于通过 Chat Completions 返回图片的中转站，需确认支持多模态图片输出。',
    baseUrl: 'https://your-provider.example/v1',
  },
  gemini_native: {
    description: '用于 Gemini 官方或兼容 generateContent 原生协议的中转站。',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
}

export const imageEndpointPresets: Array<{
  id: string
  label: string
  name: string
  protocol: AIProtocol
  baseUrl: string
}> = [
  {
    id: 'openai',
    label: 'OpenAI 官方',
    name: 'OpenAI 官方',
    protocol: 'openai_images',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'gemini',
    label: 'Gemini 官方',
    name: 'Gemini 官方',
    protocol: 'gemini_native',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  { id: 'custom', label: '兼容中转站', name: '', protocol: 'openai_images', baseUrl: '' },
]
