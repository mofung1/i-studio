export interface InspirationSubmission {
  id: string
  userId?: string
  username?: string
  personalPromptId: string
  version: number
  publishedVersion: number
  publicationId: string
  published: boolean
  rewardMinor: number
  title: string
  categoryId: string
  category: string
  prompt: string
  instructions: string
  requiresReference: boolean
  coverPath: string
  width: number
  height: number
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  reviewReason: string
  reviewedAt: string | null
  createdAt: string
}
export interface SubmissionPage {
  submissions: InspirationSubmission[]
  total: number
  page: number
  totalPages: number
}
export interface SubmissionDetail {
  submission: InspirationSubmission
  history: InspirationSubmission[]
  nextBeforeVersion: number
}
export interface SubmissionSettings {
  enabled: boolean
  dailyLimit: number
}
export const submissionStatuses = [
  ['all', '全部状态'],
  ['pending', '待审核'],
  ['approved', '已通过'],
  ['rejected', '未通过'],
  ['withdrawn', '已撤回'],
] as const
export function submissionStatus(item: InspirationSubmission) {
  if (item.status === 'approved') return item.published ? '已公开' : '已通过 · 未上架'
  return submissionStatuses.find(([status]) => status === item.status)?.[1] ?? item.status
}
export function parseSubmissionReward(value: string) {
  if (!/^\d{1,7}$/.test(value.trim())) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000 ? amount * 100 : null
}
