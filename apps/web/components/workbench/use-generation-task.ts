'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { generationInputSchema, type GenerationInput } from '@/lib/contracts'

import { apiBaseUrl, getAccessToken, readApiError, uploadAsset } from '@/lib/api'

export type InlineGenerationTask = {
  id: string
  status: string
  resultImages?: string[]
  /** 与 resultImages 逐项对应的模块 key（custom 模块化生成时才有） */
  resultModules?: string[]
  errorMessage?: string
}

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'expired'])

export const generationStatusLabels: Record<string, string> = {
  queued: '排队中，前面还有任务',
  processing: '正在生成',
  waiting_provider: '已提交给 AI 服务，等待返回',
}

export type GenerationNotice = { kind: 'success' | 'error'; message: string }

export type SubmitParams = {
  productFiles: File[]
  referenceFiles: File[]
  /** 用已上传资产 ID 构建待提交的 payload；返回 null 表示前置校验未过 */
  buildPayload: (productAssetIds: string[], referenceAssetIds: string[]) => unknown
  /** 未登录或 401 时的跳转回调 */
  onAuthRequired: () => void
  /** 任务创建成功后调整工作台布局，不在校验或提交失败时触发。 */
  onSubmitted?: () => void
}

export function useGenerationTask(scopeKey = 'default') {
  // 历史生成结果列表；即使任务失败，只要有部分图片也保留结果，支持切换查看
  const [resultHistory, setResultHistory] = useState<InlineGenerationTask[]>([])
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const [generationTask, setGenerationTask] = useState<InlineGenerationTask | null>(null)
  const [generationTaskScope, setGenerationTaskScope] = useState(scopeKey)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState<GenerationNotice | null>(null)
  const submissionId = useRef(0)
  const submittingRef = useRef(false)

  const isGenerating = Boolean(generationTask && !terminalStatuses.has(generationTask.status))
  const activeResult = resultHistory[activeResultIndex] ?? null

  const reset = useCallback(() => {
    setGenerationTask(null)
    setNotice(null)
  }, [])

  const removeResult = useCallback((id: string) => {
    const removedIndex = resultHistory.findIndex(item => item.id === id)
    if (removedIndex >= 0) {
      setResultHistory(previous => previous.filter(item => item.id !== id))
      setActiveResultIndex(index => Math.max(0, index - (removedIndex <= index ? 1 : 0)))
    }
    setGenerationTask(current => current?.id === id ? null : current)
  }, [resultHistory])

  // 通用生图和电商生图使用不同的结果作用域，切换工作台时不能沿用另一类结果。
  useEffect(() => {
    setResultHistory([])
    setActiveResultIndex(0)
    setGenerationTask(null)
    setGenerationTaskScope(scopeKey)
    setNotice(null)
    setIsSubmitting(false)
    submittingRef.current = false
    submissionId.current += 1
    return () => { submissionId.current += 1 }
  }, [scopeKey])

  useEffect(() => {
    if (notice?.kind !== 'success') return

    const timer = window.setTimeout(() => {
      setNotice((current) => current === notice ? null : current)
    }, 10_000)

    return () => window.clearTimeout(timer)
  }, [notice])

  // 轮询任务状态，结束后把成功结果追加到历史并切到最新
  useEffect(() => {
    if (generationTaskScope !== scopeKey || !generationTask || terminalStatuses.has(generationTask.status)) return

    let cancelled = false
    let timer = 0
    let pollingNotice: GenerationNotice | null = null
    const loadTask = async () => {
      try {
        const token = getAccessToken()
        if (!token) return
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${generationTask.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error(await readApiError(response, '任务状态获取失败'))
        const data = await response.json() as { task: InlineGenerationTask }
        if (cancelled) return
        setNotice(current => current === pollingNotice ? null : current)
        setGenerationTask(data.task)
        if (terminalStatuses.has(data.task.status) && data.task.resultImages?.length) {
          setResultHistory((prev) => {
            if (prev.some((item) => item.id === data.task.id)) return prev
            const next = [...prev, data.task]
            setActiveResultIndex(next.length - 1)
            return next
          })
        }
        if (!terminalStatuses.has(data.task.status)) timer = window.setTimeout(loadTask, 3000)
      } catch (error) {
        if (cancelled) return
        pollingNotice = { kind: 'error', message: `${error instanceof Error ? error.message : '任务状态获取失败'}，正在重试查询` }
        setNotice(pollingNotice)
        timer = window.setTimeout(loadTask, 3000)
      }
    }

    void loadTask()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [generationTask?.id, generationTask?.status, generationTaskScope, scopeKey])

  const submit = useCallback(async ({ productFiles, referenceFiles, buildPayload, onAuthRequired, onSubmitted }: SubmitParams) => {
    if (submittingRef.current) return
    const token = getAccessToken()
    if (!token) {
      onAuthRequired()
      return
    }

    const requestId = ++submissionId.current
    const isCurrent = () => requestId === submissionId.current
    submittingRef.current = true
    setIsSubmitting(true)
    setNotice(null)
    setGenerationTask(null)
    setGenerationTaskScope(scopeKey)
    try {
      const draftResult = generationInputSchema.safeParse(buildPayload(
        productFiles.map((_, index) => `pending-product-${index}`),
        referenceFiles.map((_, index) => `pending-reference-${index}`),
      ))
      if (!draftResult.success) {
        const firstIssue = draftResult.error.issues[0]
        throw new Error(firstIssue?.message ?? '请完成必填配置')
      }
      const [productAssetIds, referenceAssetIds] = await Promise.all([
        Promise.all(productFiles.map((file) => uploadAsset(file, token))),
        Promise.all(referenceFiles.map((file) => uploadAsset(file, token))),
      ])
      if (!isCurrent()) return
      const result = generationInputSchema.safeParse(buildPayload(productAssetIds, referenceAssetIds))

      if (!result.success) {
        const firstIssue = result.error.issues[0]
        throw new Error(firstIssue?.message ?? '请完成必填配置')
      }

      const validatedInput: GenerationInput = result.data
      const response = await fetch(`${apiBaseUrl}/v1/generation/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(validatedInput),
      })
      if (!isCurrent()) return
      if (response.status === 401) {
        onAuthRequired()
        return
      }
      if (!response.ok) throw new Error(await readApiError(response, '任务创建失败'))
      const data = await response.json() as { task: InlineGenerationTask; message: string }
      if (!isCurrent()) return
      setGenerationTask(data.task)
      onSubmitted?.()
    } catch (error) {
      if (isCurrent()) setNotice({ kind: 'error', message: error instanceof Error ? error.message : '任务创建失败，请稍后重试' })
    } finally {
      if (isCurrent()) {
        submittingRef.current = false
        setIsSubmitting(false)
      }
    }
  }, [scopeKey])

  return {
    generationTask,
    resultHistory,
    activeResultIndex,
    activeResult,
    isSubmitting,
    isGenerating,
    notice,
    setNotice,
    setActiveResultIndex,
    submit,
    reset,
    removeResult,
  }
}
