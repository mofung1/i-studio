'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import type { HistoryTask } from './use-task-history'
import type { WorkbenchMode } from './shared'

export function historyWorkbenchUrl(record: HistoryTask, regenerate = false) {
  const query = new URLSearchParams({
    mode: record.input.mode === 'commerce' ? 'commerce' : 'general',
    resumeTask: record.id,
  })
  if (record.input.mode === 'commerce') query.set('task', record.input.taskType ?? 'product-main')
  if (regenerate) query.set('review', '1')
  return `/workbench?${query}`
}
export function referenceWorkbenchUrl(path: string, mode: WorkbenchMode, taskType: string) {
  const match = path.match(/^\/v1\/assets\/([^/]+)\/content$/)
  if (!match?.[1]) return null
  const query = new URLSearchParams({ mode, referenceAsset: match[1] })
  if (mode === 'commerce') query.set('task', taskType)
  return `/workbench?${query}`
}

/** Transfer protected task/asset IDs between the two workbench components. */
export function useWorkbenchHandoff({
  ready,
  onHistory,
  onReference,
  onError,
}: {
  ready: boolean
  onHistory: (record: HistoryTask, review: boolean) => Promise<unknown>
  onReference: (path: string) => Promise<unknown>
  onError: (message: string) => void
}) {
  const search = useSearchParams()
  const taskId = search.get('resumeTask')
  const assetId = search.get('referenceAsset')
  const review = search.get('review') === '1'
  const callbacks = useRef({ onHistory, onReference, onError })
  callbacks.current = { onHistory, onReference, onError }
  const handled = useRef('')
  useEffect(() => {
    const key = `${taskId ?? ''}:${assetId ?? ''}:${review}`
    if (!ready || (!taskId && !assetId) || handled.current === key) return
    const controller = new AbortController()
    async function load() {
      try {
        if (taskId) {
          const response = await fetch(
            `${apiBaseUrl}/v1/generation/tasks/${encodeURIComponent(taskId)}`,
            { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal: controller.signal },
          )
          if (!response.ok) throw new Error(await readApiError(response, '历史记录读取失败'))
          const data = (await response.json()) as { task: HistoryTask }
          if (controller.signal.aborted) return
          handled.current = key
          await callbacks.current.onHistory(data.task, review)
        } else if (assetId && !assetId.includes('/')) {
          handled.current = key
          await callbacks.current.onReference(`/v1/assets/${encodeURIComponent(assetId)}/content`)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          handled.current = key
          callbacks.current.onError(error instanceof Error ? error.message : '素材载入失败')
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [ready, taskId, assetId, review])
}
