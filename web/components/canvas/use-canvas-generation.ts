'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import { fetchGenerationQuote } from '@/components/generation-cost'
import { generalGenerationInputSchema, type GeneralGenerationInput } from '@/lib/contracts'
import type { CanvasImageNodeResult } from '@/lib/canvas'

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'expired'])
const activeStatuses = new Set(['queued', 'processing', 'waiting_provider'])

interface TaskSnapshot {
  id: string
  status: string
  resultImages?: string[]
  resultDetails?: CanvasImageNodeResult['details']
  errorMessage?: string
}

/**
 * 画布图像节点的生成流程：报价 → 提交任务 → 轮询 → 回填结果。
 *
 * 与工作台的 useGenerationTask 不同，画布节点不需要结果历史、重做图片等交互，
 * 只关心「这一次生成落到这个节点」；提交时保留 Idempotency-Key，失败重试不会重复扣费。
 */
export function useCanvasImageGeneration({
  initialTaskId,
  onResult,
}: {
  /** 节点上次保存的进行中任务；刷新后据此续接轮询。 */
  initialTaskId?: string | null
  onResult: (result: CanvasImageNodeResult) => void
}) {
  const [task, setTask] = useState<TaskSnapshot | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittingRef = useRef(false)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  const isGenerating = Boolean(task && activeStatuses.has(task.status))

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const poll = useCallback(
    (id: string) => {
      stopPolling()
      const load = async () => {
        const token = getAccessToken()
        if (!token) return
        try {
          const response = await fetch(
            `${apiBaseUrl}/v1/generation/tasks/${encodeURIComponent(id)}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          )
          if (!response.ok) throw new Error(await readApiError(response, '任务状态获取失败'))
          const data = (await response.json()) as { task?: TaskSnapshot }
          const next = data.task
          if (!next || !next.status) throw new Error('任务响应不完整')
          setTask(next)
          if (terminalStatuses.has(next.status)) {
            resultRef.current({
              status: next.status,
              taskId: next.id,
              images: next.resultImages ?? [],
              details: next.resultDetails,
              error: next.errorMessage,
            })
          } else {
            pollTimer.current = setTimeout(load, 3000)
          }
        } catch (error) {
          setNotice(error instanceof Error ? error.message : '任务状态获取失败，正在重试')
          pollTimer.current = setTimeout(load, 3000)
        }
      }
      void load()
    },
    [stopPolling],
  )

  // 节点保存了进行中的 taskId 时，刷新后自动续接轮询。
  useEffect(() => {
    if (!initialTaskId) return
    poll(initialTaskId)
    return stopPolling
  }, [initialTaskId, poll, stopPolling])

  useEffect(() => stopPolling, [stopPolling])

  const generate = useCallback(
    async (input: GeneralGenerationInput) => {
      if (submittingRef.current || isGenerating) return
      const parsed = generalGenerationInputSchema.safeParse(input)
      if (!parsed.success) {
        setNotice(parsed.error.issues[0]?.message ?? '请完成节点配置')
        return
      }
      if (!parsed.data.endpointId) {
        setNotice('请选择生图模型')
        return
      }
      const token = getAccessToken()
      if (!token) {
        setNotice('登录状态已失效，请重新登录')
        return
      }

      submittingRef.current = true
      setIsSubmitting(true)
      setNotice('')
      setTask(null)
      try {
        const quote = await fetchGenerationQuote(parsed.data.endpointId, parsed.data.count ?? 1)
        if (!quote.canAfford) {
          throw new Error(`${quote.creditName}不足，请前往个人中心查看余额`)
        }
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
            'X-Expected-Unit-Price': String(quote.unitPriceMinor),
          },
          body: JSON.stringify(parsed.data),
        })
        if (response.status === 401) {
          setNotice('登录状态已失效，请重新登录')
          return
        }
        if (!response.ok) {
          throw new Error(await readApiError(response, '任务创建失败，请重试'))
        }
        const data = (await response.json()) as { task?: TaskSnapshot }
        if (!data.task?.id || !data.task.status) throw new Error('任务响应不完整')
        setTask(data.task)
        if (terminalStatuses.has(data.task.status)) {
          resultRef.current({
            status: data.task.status,
            taskId: data.task.id,
            images: data.task.resultImages ?? [],
            details: data.task.resultDetails,
            error: data.task.errorMessage,
          })
        } else {
          // 先回填进行中状态（含 taskId），刷新后能续接轮询。
          resultRef.current({ status: data.task.status, taskId: data.task.id, images: [] })
          poll(data.task.id)
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '任务创建失败，请稍后重试')
      } finally {
        submittingRef.current = false
        setIsSubmitting(false)
      }
    },
    [isGenerating, poll],
  )

  return { generate, isSubmitting, isGenerating, notice }
}
