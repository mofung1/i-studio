import { apiBaseUrl, getAccessToken, readApiError } from './api'
import type { HistoryTask } from '@/components/workbench/use-task-history'

export interface LibraryProject {
  id: string
  name: string
  archived?: boolean
  assetCount?: number
  taskCount?: number
}
export interface LibraryAsset {
  id: string
  title: string
  filename: string
  mime: string
  width: number
  height: number
  sizeBytes: number
  favorite: boolean
  tags: string[]
  projectId: string
  projectName: string
  createdAt: string
  contentPath: string
  thumbnailPath: string
  task?: HistoryTask
}
export async function libraryRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('请先登录')
  const response = await fetch(`${apiBaseUrl}/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  if (!response.ok) throw new Error(await readApiError(response, '操作失败，请重试'))
  return response.json() as Promise<T>
}
export function assetTitle(asset: LibraryAsset) {
  return asset.title || asset.task?.input.productName || asset.task?.input.prompt?.slice(0, 32) || asset.task?.input.requirements?.slice(0, 32) || asset.filename
}
export function assetFilename(asset: LibraryAsset) {
  const extension = asset.mime === 'image/jpeg' ? '.jpg' : asset.mime === 'image/webp' ? '.webp' : '.png'
  return `${assetTitle(asset).replace(/[\\/:*?"<>|]/g, '_')}${extension}`
}
export function mergeLibraryPage<T extends { id: string }>(previous: T[], incoming: T[]) {
  const ids = new Set(previous.map(item => item.id))
  return [...previous, ...incoming.filter(item => !ids.has(item.id))]
}
export async function downloadLibraryAssets(ids: string[]) {
  const response = await fetch(`${apiBaseUrl}/v1/library/download`, {
    method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  })
  if (!response.ok) throw new Error(await readApiError(response, '下载失败'))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'istudio-assets.zip'; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
