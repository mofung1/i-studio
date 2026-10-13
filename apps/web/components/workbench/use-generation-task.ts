'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { generationInputSchema, type GenerationInput } from '@/lib/contracts'

import { apiBaseUrl, getAccessToken, readApiError, uploadAsset } from '@/lib/api'

export type InlineGenerationTask = {
  id: string
  status: string
  input?: GenerationInput
  resultImages?: string[]
  /** 与 resultImages 逐项对应的模块 key（custom 模块化生成时才有） */
  resultModules?: string[]
  errorMessage?: string
}

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'expired'])
const activeStatuses = new Set(['queued', 'processing', 'waiting_provider'])

function pendingTaskId(scope: string, value?: string | null) {
  try {
    const key = `istudio-pending-generation:${scope.startsWith('general:') ? 'general' : scope}`
    if (value === null) window.sessionStorage.removeItem(key)
    else if (value !== undefined) window.sessionStorage.setItem(key, value)
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export const generationStatusLabels: Record<string, string> = {
  queued: '排队中，前面还有任务',
  processing: '正在生成',
  waiting_provider: '已提交给 AI 服务，等待返回',
}

export type GenerationNotice = { kind: 'success' | 'error'; message: string }

export type SubmitParams = {
  productFiles: File[]
  referenceFiles: File[]
  modelFile?: File
  sceneFile?: File
  /** 用已上传资产 ID 构建待提交的 payload；返回 null 表示前置校验未过 */
  buildPayload: (productAssetIds: string[], referenceAssetIds: string[], roles?: { modelAssetId?: string; sceneAssetId?: string }) => unknown
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
    const requestId = submissionId.current
    const controller = new AbortController()
    const token = getAccessToken()
    // Navigation only stops browser polling. Reconnect to the server-owned task on return.
    const restoreTask = async () => {
      if (!token) return
      const savedId = pendingTaskId(scopeKey)
      const [mode = 'general', taskType] = scopeKey.split(':')
      const params = new URLSearchParams({ limit: '50', mode })
      if (mode === 'commerce' && taskType) params.set('taskType', taskType)
      try {
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks${savedId ? `/${encodeURIComponent(savedId)}` : `?${params}`}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })
        if (controller.signal.aborted || requestId !== submissionId.current) return
        if (!response.ok) {
          if (savedId && (response.status === 401 || response.status === 404)) pendingTaskId(scopeKey, null)
          return
        }
        const data = await response.json() as { task?: InlineGenerationTask; tasks?: InlineGenerationTask[] }
        if (controller.signal.aborted || requestId !== submissionId.current) return
        const restored = savedId ? data.task : data.tasks?.find(item => activeStatuses.has(item.status))
        if (!restored || restored.input?.mode !== mode) return
        if (restored.input.mode === 'commerce' && restored.input.taskType !== taskType) return
        setGenerationTask(restored)
        if (terminalStatuses.has(restored.status)) {
          pendingTaskId(scopeKey, null)
          if (restored.resultImages?.length) setResultHistory([restored])
        } else pendingTaskId(scopeKey, restored.id)
      } catch {
        // A read failure must not block creating a new task or report a generation failure.
      }
    }
    void restoreTask()
    return () => { controller.abort(); submissionId.current += 1 }
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
        if (terminalStatuses.has(data.task.status) && pendingTaskId(scopeKey) === data.task.id) pendingTaskId(scopeKey, null)
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

  const submit = useCallback(async ({ productFiles, referenceFiles, modelFile, sceneFile, buildPayload, onAuthRequired, onSubmitted }: SubmitParams) => {
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
        { modelAssetId: modelFile ? 'pending-model' : undefined, sceneAssetId: sceneFile ? 'pending-scene' : undefined },
      ))
      if (!draftResult.success) {
        const firstIssue = draftResult.error.issues[0]
        throw new Error(firstIssue?.message ?? '请完成必填配置')
      }
      const [productAssetIds, referenceAssetIds, modelAssetId, sceneAssetId] = await Promise.all([
        Promise.all(productFiles.map((file) => uploadAsset(file, token))),
        Promise.all(referenceFiles.map((file) => uploadAsset(file, token))),
        modelFile ? uploadAsset(modelFile, token) : undefined,
        sceneFile ? uploadAsset(sceneFile, token) : undefined,
      ])
      if (!isCurrent()) return
      const result = generationInputSchema.safeParse(buildPayload(productAssetIds, referenceAssetIds, { modelAssetId, sceneAssetId }))

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
      if (!isCurrent() && !response.ok) return
      if (response.status === 401) {
        onAuthRequired()
        return
      }
      if (!response.ok) throw new Error(await readApiError(response, '任务创建失败'))
      const data = await response.json() as { task: InlineGenerationTask; message: string }
      if (isCurrent() || !pendingTaskId(scopeKey)) pendingTaskId(scopeKey, data.task.id)
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
