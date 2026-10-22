import { apiBaseUrl, getAdminAccessToken, readApiError } from './api'
import { assertRequestScope } from './request-scope'

export interface ModelChannel {
  id?: string
  endpointId: string
  upstreamModelId: string
  enabled: boolean
  isActive: boolean
}
export interface ModelCapabilities {
  referenceImages: boolean
  aspectRatios: string[]
  resolutions: string[]
}
export const defaultModelCapabilities: ModelCapabilities = {
  referenceImages: true,
  aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
  resolutions: ['1K', '2K', '4K'],
}

export interface AdminModel {
  id: string
  name: string
  version: number
  channels: ModelChannel[]
  capabilities: ModelCapabilities
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
  checkinEnabled?: boolean
  checkinRewardMinor?: number
  checkinDailyBudgetMinor?: number
  creditHelpText?: string
  creditContactUrl?: string
  announcementEnabled?: boolean
  announcementTitle?: string
  announcementContent?: string
  maxConcurrentTasks: number
  generationRequestsPerHour: number
  auxiliaryRequestsPerHour: number
  platformAuxiliaryConcurrent?: number
  platformAuxiliaryPerDay?: number
  signupGiftDailyBudgetMinor?: number
  dailyCreditAlertMinor?: number
  accountStorageLimitBytes?: number
  registrationInviteRequired?: boolean
  registrationInviteConfigured?: boolean
  registrationInviteCode?: string
}

export interface ImageOutputDetail {
  contentPath?: string
  width: number
  height: number
  elapsedMs: number | null
  sizeBytes?: number
}

export interface ImageMeasurement extends ImageOutputDetail {
  id: string
  endpointId: string
  model: string
  aspectRatio: string
  resolution: string
  success: boolean
  errorMessage: string
  estimatedCostMicros: number | null
  actualCostMicros: number | null
  currency: string
  costNote: string
  createdAt: string
}

export interface AdminTask {
  aspectRatio?: string
  resolution?: string
  resultDetails?: ImageOutputDetail[]
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

export interface OperationalMonitoring {
  checkedAt: string
  queueWaitSeconds: number
  leaseGraceSeconds: number
  generationQueued: number
  reverseQueued: number
  generationOverdue: number
  reverseOverdue: number
  oldestGenerationWaitSeconds: number
  oldestReverseWaitSeconds: number
  expiredGenerationLeases: number
  expiredReverseRuns: number
  terminalReservations: number
  agedReservations: number
  heldMismatchAccounts: number
  storageFailures24h: number
  deletionRetryPending: number
  deletionRetryRepeated: number
  storageMonitoringDropped: number
  issues: Array<{
    kind: string
    id: string
    status: string
    ageSeconds: number
    heldMinor: number
    expectedHeldMinor: number
  }>
  storageFailures: Array<{
    id: string
    operation: string
    backend: string
    objectReference: string
    createdAt: string
  }>
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

export async function adminFetch(path: string, options: RequestInit = {}) {
  assertRequestScope(path, 'admin')
  const token = getAdminAccessToken()
  if (!token) throw new Error('请先登录运营后台')
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${apiBaseUrl}/v1/admin/${path}`, {
    ...options,
    cache: 'no-store',
    headers,
  })
  if (!response.ok) throw new Error(await readApiError(response, '后台请求失败，请重试'))
  return response
}

export async function adminRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await adminFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  return response.json() as Promise<T>
}
