'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import type { ClothingMode, ClothingShot, ClothingStyle } from '@/lib/contracts'
import { useAccount } from '@/components/account-provider'

/** 历史任务的输入参数，字段与 /v1/generation/tasks 返回的 input 一致 */
export interface HistoryTaskInput {
  mode?: string
  taskType?: string
  prompt?: string
  requirements?: string
  productName?: string
  platform?: string
  outputLanguage?: string
  style?: string
  referenceStrength?: string
  moduleMode?: string
  moduleCounts?: Record<string, number>
  recreateStrength?: string
  enhancements?: string[]
  model?: string
  endpointId?: string
  aspectRatio?: string
  resolution?: string
  count?: number
  productAssetIds?: string[]
  referenceAssetIds?: string[]
  clothingMode?: ClothingMode
  clothingStyle?: ClothingStyle
  clothingPlan?: ClothingShot[]
  modelAssetId?: string
  sceneAssetId?: string
}

export interface HistoryTask {
  id: string
  status: string
  createdAt: string
  input: HistoryTaskInput
  resultImages?: string[]
  resultModules?: string[]
  errorMessage?: string
}

const taskTypeLabels: Record<string, string> = {
  'product-main': '商品主图',
  'detail-page': '商品详情',
  'viral-recreate': '爆款复刻',
  'product-retouch': '产品精修',
  'clothing-set': '服装组图',
}

export const activeTaskStatuses = new Set(['queued', 'processing', 'waiting_provider'])

export function taskModeLabel(input: HistoryTaskInput) {
  if (input.mode === 'commerce') return taskTypeLabels[input.taskType ?? ''] ?? '电商设计'
  return '通用生图'
}

export function taskTitle(input: HistoryTaskInput) {
  return (
    input.productName ||
    input.prompt?.slice(0, 24) ||
    input.requirements?.slice(0, 24) ||
    taskModeLabel(input)
  )
}

interface UseTaskHistoryOptions {
  /** 过滤模式：不传表示全部 */
  mode?: string
  /** 过滤任务类型：仅电商模式使用 */
  taskType?: string
  limit?: number
  enabled?: boolean
  /** 变化时重新拉取（例如生成完成后） */
  refreshKey?: number
}

/** 读取持久化的生成任务记录，供工作台的「历史记录」抽屉使用。 */
export function useTaskHistory({
  mode,
  taskType,
  limit = 30,
  enabled = true,
  refreshKey = 0,
}: UseTaskHistoryOptions) {
  const { account } = useAccount()
  const owner = account.user?.id ?? ''
  const [tasks, setTasks] = useState<HistoryTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [nextCursor, setNextCursor] = useState('')
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (cursor = '') => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const signal = controller.signal
      const id = ++requestId.current
      const token = getAccessToken()
      if (!token) {
        setTasks([])
        setError('')
        return
      }
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ limit: String(limit) })
        if (cursor) params.set('cursor', cursor)
        if (mode) params.set('mode', mode)
        if (mode === 'commerce' && taskType) params.set('taskType', taskType)
        let response: Response
        try {
          response = await fetch(`${apiBaseUrl}/v1/generation/tasks?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal,
          })
        } catch {
          throw new Error('历史记录加载失败，请检查后端服务是否已启动')
        }
        if (!response.ok) throw new Error(await readApiError(response, '历史记录加载失败'))
        const data = (await response.json()) as { tasks?: HistoryTask[]; nextCursor?: string }
        if (signal.aborted || id !== requestId.current || getAccessToken() !== token) return
        const items = (data.tasks ?? []).filter(
          (task) => (task.resultImages?.length ?? 0) > 0 || task.errorMessage,
        )
        setTasks((previous) =>
          cursor
            ? [...previous, ...items.filter((item) => !previous.some((old) => old.id === item.id))]
            : items,
        )
        setNextCursor(data.nextCursor ?? '')
        setError('')
      } catch (reason) {
        if (signal?.aborted || (reason instanceof DOMException && reason.name === 'AbortError'))
          return
        setError(reason instanceof Error ? reason.message : '历史记录加载失败')
      } finally {
        if (!signal.aborted && id === requestId.current) setIsLoading(false)
      }
    },
    [limit, mode, taskType],
  )

  useEffect(() => {
    setTasks([])
    setNextCursor('')
    setError('')
    setIsLoading(false)
    if (!enabled || !account.authenticated) return
    void load()
    return () => {
      requestId.current += 1
      controllerRef.current?.abort()
    }
  }, [enabled, load, refreshKey, owner, account.authenticated])

  const reload = useCallback(() => {
    void load()
  }, [load])

  const loadMore = useCallback(() => {
    if (nextCursor && !isLoading) void load(nextCursor)
  }, [isLoading, load, nextCursor])
  return {
    tasks: account.authenticated ? tasks : [],
    isLoading,
    error,
    reload,
    hasMore: !!nextCursor,
    loadMore,
  }
}
