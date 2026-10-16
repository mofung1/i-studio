import { storedImage } from './creation-images'
import { apiBaseUrl, getAccessToken, readApiError } from './api'
import type { HistoryTask } from '@/components/workbench/use-task-history'
import { frontendRequest } from './frontend-request'

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
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')
  return frontendRequest<T>(path, {
    ...init,
    headers,
  })
}
export function assetTitle(asset: LibraryAsset) {
  return (
    asset.title ||
    asset.task?.input.productName ||
    asset.task?.input.prompt?.slice(0, 32) ||
    asset.task?.input.requirements?.slice(0, 32) ||
    asset.filename
  )
}
export function assetFilename(asset: LibraryAsset) {
  const extension =
    asset.mime === 'image/jpeg' ? '.jpg' : asset.mime === 'image/webp' ? '.webp' : '.png'
  return `${assetTitle(asset).replace(/[\\/:*?"<>|]/g, '_')}${extension}`
}
export function mergeLibraryPage<T extends { id: string }>(previous: T[], incoming: T[]) {
  const ids = new Set(previous.map((item) => item.id))
  return [...previous, ...incoming.filter((item) => !ids.has(item.id))]
}
export async function downloadLibraryAssets(ids: string[]) {
  const response = await fetch(`${apiBaseUrl}/v1/library/download`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) throw new Error(await readApiError(response, '下载失败'))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'istudio-assets.zip'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Resolve metadata only; image bytes stay in storage until actually needed. */
export async function loadStoredImage(path: string) {
  const id = /^\/v1\/assets\/([^/]+)\/content$/.exec(path)?.[1]
  if (!id) throw new Error('这张图片暂不支持用作素材')
  const data = await libraryRequest<{ asset: LibraryAsset }>(
    `assets/${encodeURIComponent(id)}/metadata`,
  )
  return storedImage(data.asset)
}

export function formatLibraryDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
