import type { CreationImage } from './creation-images'
import { apiBaseUrl, getAccessToken, readApiError } from './api'

export type ReverseMode = 'scene' | 'style'
export type ReverseLanguage = 'zh' | 'en'
export interface ReverseSettings { endpointId: string; timeoutSeconds: number; imageDetail: 'auto' | 'high' | 'low'; retentionHours: number }
export interface ReverseConfiguration { settings: ReverseSettings; available: boolean; reason: string; serviceName: string; model: string }
export interface ReverseResult {
  promptZh: string; promptEn: string; model: string; templateVersion: string
  analysis: Record<'subject' | 'scene' | 'composition' | 'lighting' | 'colors' | 'materials' | 'style' | 'text', string>
  uncertainties: string[]
}
export interface ReverseTask {
  id: string; status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
  mode: ReverseMode; requirements: string; imageUrl: string; imageName: string; imageWidth: number; imageHeight: number
  result?: ReverseResult; errorMessage?: string; createdAt: string; updatedAt: string; expiresAt: string
}
export interface ReverseApplication { text: string; referenceFile?: CreationImage; action: 'replace' | 'append' }
export interface ReverseOpenOptions { files?: File[]; assetId?: string; imageName?: string; currentPrompt?: string; onApply?: (application: ReverseApplication) => void | Promise<void> }
export class ReverseRequestError extends Error { constructor(message: string, readonly status: number) { super(message) } }

export async function reverseRequest<T>(path: string, options: RequestInit = {}, fallback = '图片分析请求失败，请稍后重试'): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/v1/${path}`, { ...options, cache: 'no-store', headers: { Authorization: `Bearer ${getAccessToken()}`, ...options.headers } })
  if (!response.ok) throw new ReverseRequestError(await readApiError(response, fallback), response.status)
  return response.json() as Promise<T>
}
export const isReverseActive = (task: ReverseTask | null) => task?.status === 'queued' || task?.status === 'processing'
export function createReverseRequestId() { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `reverse_${Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2,'0')).join('')}` }
export const reverseStatusLabels: Record<ReverseTask['status'], string> = { queued: '等待分析', processing: '正在分析图片', succeeded: '分析完成', failed: '分析失败', cancelled: '已取消分析' }
export const analysisLabels: Record<keyof ReverseResult['analysis'], string> = { subject: '主体', scene: '场景', composition: '构图', lighting: '光线', colors: '色彩', materials: '质感', style: '风格', text: '画面文字' }

export function reverseStorageKey(suffix: string) {
  let owner = 'anonymous'
  try { const value = JSON.parse(atob((getAccessToken().split('.')[0] ?? '').replace(/-/g, '+').replace(/_/g, '/'))); if (typeof value.sub === 'string') owner = value.sub }
  catch { /* A missing session has no private draft to restore. */ }
  return `istudio-reverse:${owner}:${suffix}`
}
export function applyReverseText(previous: string, next: string, action: 'replace' | 'append') {
  return action === 'replace' || !previous.trim() ? next.trim() : `${previous.trimEnd()}\n\n${next.trim()}`
}
export function validateReverseFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片')
  if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB，请压缩后重试')
}
/** Keep alpha and the displayed orientation; temporary analysis images stay separate from assets. */
export async function prepareReverseFile(file: File, detail: ReverseSettings['imageDetail']): Promise<File> {
  validateReverseFile(file)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { if (file.size <= 5 * 1024 * 1024) return file; throw new Error('图片无法压缩，请选择较小的图片') }
  try {
    for (const edge of [detail === 'high' ? 2048 : 1536, 1024]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法读取图片，请换一张重试')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, .9))
      if (blob && blob.size <= 5 * 1024 * 1024) return new File([blob], file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg'), { type })
    }
    throw new Error('图片压缩后仍较大，请先缩小图片再试')
  } finally { bitmap.close() }
}
