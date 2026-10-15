'use client'

import type { CreationImage } from '@/lib/creation-images'

import { useCallback, useEffect, useRef, useState } from 'react'

import { generationInputSchema, type GenerationInput } from '@/lib/contracts'

import { displayedUnitPrice, fetchGenerationQuote } from '../generation-cost'
import { refreshAccount } from '@/lib/credits'
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
  productFiles: CreationImage[]
  referenceFiles: CreationImage[]
  modelFile?: CreationImage
  sceneFile?: CreationImage
  /** 用已上传资产 ID 构建待提交的 payload；返回 null 表示前置校验未过 */
  buildPayload: (
    productAssetIds: string[],
    referenceAssetIds: string[],
    roles?: { modelAssetId?: string; sceneAssetId?: string },
  ) => unknown
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
  const [recoveryRevision, setRecoveryRevision] = useState(0)
  const [notice, setNotice] = useState<GenerationNotice | null>(null)
  const preparedSubmission = useRef<{
    key: string
    input: GenerationInput
    expected: number
  } | null>(null)
  const submissionId = useRef(0)
  const submittingRef = useRef(false)

  const isGenerating = Boolean(generationTask && !terminalStatuses.has(generationTask.status))
  const activeResult = resultHistory[activeResultIndex] ?? null

  useEffect(() => {
    if (generationTask && terminalStatuses.has(generationTask.status)) refreshAccount()
  }, [generationTask?.id, generationTask?.status])

  const reset = useCallback(() => {
    setGenerationTask(null)
    setNotice(null)
  }, [])

  const removeResult = useCallback(
    (id: string) => {
      const removedIndex = resultHistory.findIndex((item) => item.id === id)
      if (removedIndex >= 0) {
        setResultHistory((previous) => previous.filter((item) => item.id !== id))
        setActiveResultIndex((index) => Math.max(0, index - (removedIndex <= index ? 1 : 0)))
      }
      setGenerationTask((current) => (current?.id === id ? null : current))
    },
    [resultHistory],
  )

  // 通用生图和电商生图使用不同的结果作用域，切换工作台时不能沿用另一类结果。
  useEffect(() => {
    setResultHistory([])
    setActiveResultIndex(0)
    setGenerationTask(null)
    preparedSubmission.current = null
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
        const response = await fetch(
          `${apiBaseUrl}/v1/generation/tasks${savedId ? `/${encodeURIComponent(savedId)}` : `?${params}`}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        )
        if (controller.signal.aborted || requestId !== submissionId.current) return
        if (!response.ok) {
          if (savedId && (response.status === 401 || response.status === 404))
            pendingTaskId(scopeKey, null)
          return
        }
        const data = (await response.json()) as {
          task?: InlineGenerationTask
          tasks?: InlineGenerationTask[]
        }
        if (controller.signal.aborted || requestId !== submissionId.current) return
        const restored = savedId
          ? data.task
          : data.tasks?.find((item) => activeStatuses.has(item.status))
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
    return () => {
      controller.abort()
      submissionId.current += 1
    }
  }, [scopeKey])

  useEffect(() => {
    if (notice?.kind !== 'success') return

    const timer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current))
    }, 10_000)

    return () => window.clearTimeout(timer)
  }, [notice])

  // Recover uncertain creation responses without depending on the current form or balance.
  useEffect(() => {
    const token = getAccessToken()
    if (!token) return
    const key = `istudio-pending-submit:${token.slice(-16)}:${scopeKey}`
    let cancelled = false
    let timer = 0
    const controller = new AbortController()
    async function recover() {
      let pending = preparedSubmission.current
      if (!pending) {
        try {
          pending = JSON.parse(sessionStorage.getItem(key) ?? 'null')
        } catch {
          return
        }
      }
      if (!pending || cancelled) return
      if (submittingRef.current) {
        timer = window.setTimeout(recover, 3000)
        return
      }
      setIsSubmitting(true)
      try {
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': pending.key,
            'X-Expected-Unit-Price': String(pending.expected),
          },
          body: JSON.stringify(pending.input),
        })
        if (cancelled) return
        if (!response.ok && response.status >= 500) throw new Error('正在核对上次提交，请稍候')
        if (!response.ok) {
          preparedSubmission.current = null
          sessionStorage.removeItem(key)
          setNotice({ kind: 'error', message: await readApiError(response, '请重新提交创作') })
          setIsSubmitting(false)
          refreshAccount()
          return
        }
        const data = (await response.json()) as { task: InlineGenerationTask }
        if (!data.task?.id) throw new Error('任务响应不完整，正在重试查询')
        preparedSubmission.current = null
        sessionStorage.removeItem(key)
        pendingTaskId(scopeKey, data.task.id)
        setGenerationTask(data.task)
        setGenerationTaskScope(scopeKey)
        setIsSubmitting(false)
        setNotice(null)
        refreshAccount()
      } catch {
        if (cancelled) return
        setNotice({ kind: 'error', message: '连接中断，正在核对上次提交；恢复连接后会自动继续。' })
        timer = window.setTimeout(recover, 5000)
      }
    }
    void recover()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [scopeKey, recoveryRevision])

  // 轮询任务状态，结束后把成功结果追加到历史并切到最新
  useEffect(() => {
    if (
      generationTaskScope !== scopeKey ||
      !generationTask ||
      terminalStatuses.has(generationTask.status)
    )
      return

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
        const data = (await response.json()) as { task: InlineGenerationTask }
        if (cancelled) return
        if (!data.task?.id || !data.task.status) throw new Error('任务响应不完整')
        setNotice((current) => (current === pollingNotice ? null : current))
        setGenerationTask(data.task)
        if (terminalStatuses.has(data.task.status) && pendingTaskId(scopeKey) === data.task.id)
          pendingTaskId(scopeKey, null)
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
        pollingNotice = {
          kind: 'error',
          message: `${error instanceof Error ? error.message : '任务状态获取失败'}，正在重试查询`,
        }
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

  const submit = useCallback(
    async ({
      productFiles,
      referenceFiles,
      modelFile,
      sceneFile,
      buildPayload,
      onAuthRequired,
      onSubmitted,
    }: SubmitParams) => {
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
        // Reconcile an uncertain accepted request before creating another intent.
        const storageKey = `istudio-pending-submit:${token.slice(-16)}:${scopeKey}`
        if (!preparedSubmission.current) {
          try {
            preparedSubmission.current = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
          } catch {
            /* Ignore invalid session data. */
          }
        }
        const prepared = preparedSubmission.current
        let validatedInput: GenerationInput
        if (prepared) {
          validatedInput = prepared.input
        } else {
          const draftResult = generationInputSchema.safeParse(
            buildPayload(
              productFiles.map((_, index) => `pending-product-${index}`),
              referenceFiles.map((_, index) => `pending-reference-${index}`),
              {
                modelAssetId: modelFile ? 'pending-model' : undefined,
                sceneAssetId: sceneFile ? 'pending-scene' : undefined,
              },
            ),
          )
          if (!draftResult.success) {
            const firstIssue = draftResult.error.issues[0]
            throw new Error(firstIssue?.message ?? '请完成必填配置')
          }
          const modelId = draftResult.data.endpointId ?? ''
          if (!modelId) throw new Error('请选择可用的生图模型')
          const quotedPrice = displayedUnitPrice(modelId)
          const quote = await fetchGenerationQuote(modelId, draftResult.data.count ?? 1)
          if (quotedPrice !== undefined && quote.unitPriceMinor !== quotedPrice) {
            refreshAccount()
            throw new Error('模型价格已变更，请确认最新费用后重新提交')
          }
          if (!quote.canAfford) {
            refreshAccount()
            throw new Error(`${quote.creditName}不足，请前往个人中心查看余额`)
          }
          const [productAssetIds, referenceAssetIds, modelAssetId, sceneAssetId] =
            await Promise.all([
              Promise.all(productFiles.map((file) => uploadAsset(file, token))),
              Promise.all(referenceFiles.map((file) => uploadAsset(file, token))),
              modelFile ? uploadAsset(modelFile, token) : undefined,
              sceneFile ? uploadAsset(sceneFile, token) : undefined,
            ])
          if (!isCurrent()) return
          const result = generationInputSchema.safeParse(
            buildPayload(productAssetIds, referenceAssetIds, { modelAssetId, sceneAssetId }),
          )

          if (!result.success) {
            const firstIssue = result.error.issues[0]
            throw new Error(firstIssue?.message ?? '请完成必填配置')
          }

          validatedInput = result.data
          preparedSubmission.current = {
            key: crypto.randomUUID(),
            input: validatedInput,
            expected: quote.unitPriceMinor,
          }
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(preparedSubmission.current))
          } catch {
            /* The in-memory intent still prevents duplicate submissions. */
          }
        }
        const intent = preparedSubmission.current!

        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': intent.key,
            'X-Expected-Unit-Price': String(intent.expected),
          },
          body: JSON.stringify(validatedInput),
        })
        if (!isCurrent() && !response.ok) return
        if (response.status === 401) {
          onAuthRequired()
          return
        }
        if (!response.ok) {
          if (response.status < 500) {
            preparedSubmission.current = null
            sessionStorage.removeItem(storageKey)
          }
          refreshAccount()
          throw new Error(
            await readApiError(response, '任务创建失败；再次提交会核对原任务，不重复扣费'),
          )
        }
        const data = (await response.json()) as { task: InlineGenerationTask; message: string }
        preparedSubmission.current = null
        sessionStorage.removeItem(storageKey)
        refreshAccount()
        if (isCurrent() || !pendingTaskId(scopeKey)) pendingTaskId(scopeKey, data.task.id)
        if (!isCurrent()) return
        setGenerationTask(data.task)
        onSubmitted?.()
      } catch (error) {
        if (isCurrent()) {
          setNotice({
            kind: 'error',
            message: error instanceof Error ? error.message : '任务创建失败，请稍后重试',
          })
          if (preparedSubmission.current) setRecoveryRevision((value) => value + 1)
        }
      } finally {
        if (isCurrent()) {
          submittingRef.current = false
          setIsSubmitting(false)
        }
      }
    },
    [scopeKey],
  )

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
