import { settingsRequest } from './ai-settings'

export interface AdminModel {
  id: string
  name: string
  endpointId: string
  priceMinor: number
  enabled: boolean
  isDefault: boolean
}

export interface AdminMember {
  environmentManaged?: boolean
  id: string
  username: string
  role: string
  status: string
  available: number
  held: number
}

export interface AdminOperations {
  creditName: string
  registrationEnabled: boolean
  signupGiftMinor: number
  maxConcurrentTasks: number
  generationRequestsPerHour: number
  auxiliaryRequestsPerHour: number
}

export interface AdminTask {
  id: string
  username: string
  modelName: string
  status: string
  reserved: number
  charged: number
  refunded: number
  settled: boolean
  errorMessage: string
  createdAt: string
}

export interface AdminAudit {
  id: number
  actor: string
  action: string
  targetId: string
  detail: string
  createdAt: string
}

export interface AdminPage {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AdminTaskPage extends AdminPage {
  tasks: AdminTask[]
}
export interface AdminUserPage extends AdminPage {
  users: AdminMember[]
}
export interface AdminModelPage extends AdminPage {
  models: AdminModel[]
}
export interface AdminAuditPage extends AdminPage {
  audit: AdminAudit[]
}

export const adminRequest = <T>(path: string, method = 'GET', body?: unknown) =>
  settingsRequest<T>(`admin/${path}`, method, body)
