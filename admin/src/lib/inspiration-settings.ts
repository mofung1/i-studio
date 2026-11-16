export interface InspirationPrompt {
  submissionId?: string
  instructions?: string
  requiresReference?: boolean
  id: string
  title: string
  category: string
  prompt: string
  source: string
  imageUrl: string
  width: number
  height: number
  sortOrder: number
}

export interface InspirationCategory {
  id?: string
  category: string
  count: number
  enabledCount?: number
}


export interface ManagedInspirationPrompt extends InspirationPrompt {
  enabled: boolean
}

export type InspirationPromptInput = Pick<
  ManagedInspirationPrompt,
  'title' | 'category' | 'prompt' | 'source' | 'sortOrder' | 'enabled'
>
export interface InspirationManagementResponse {
  prompts: ManagedInspirationPrompt[]
  total: number
  page: number
  pageSize: number
}

export interface ManagedInspirationCategory {
  sortOrder?: number
  id: string
  category: string
  count: number
  enabledCount: number
}

export function inspirationDraft(item?: ManagedInspirationPrompt): InspirationPromptInput {
  return item
    ? {
        title: item.title,
        category: item.category,
        prompt: item.prompt,
        source: item.source,
        sortOrder: item.sortOrder,
        enabled: item.enabled,
      }
    : { title: '', category: '', prompt: '', source: '', sortOrder: 0, enabled: true }
}
