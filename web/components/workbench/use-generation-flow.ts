'use client'

import { useEffect, useState } from 'react'

import { getAccessToken } from '@/lib/api'
import type { CreationImage } from '@/lib/creation-images'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'
import type { GenerationQuote } from '@/lib/credits'

import { shouldSkipRegenerateConfirm } from './regenerate-dialog'
import type { GenerationNotice, SubmitParams } from './use-generation-task'
import type { HistoryTask } from './use-task-history'
import type { GeneralStyle, ModuleMode, ReferenceStrength, WorkbenchMode } from './shared'

export interface UseGenerationFlowOptions {
  mode: WorkbenchMode
  task: CommerceTaskType
  hasRecipe: boolean
  expectedCount: number
  projectId?: string
  // 提交前校验所需状态
  draftReady: boolean
  templateBlockedReason?: string
  isSubmitting: boolean
  isGenerating: boolean
  hasProductImage: boolean
  aiEnabled: boolean | null
  compatibilityIssue?: string
  referenceFileCount: number
  moduleMode: ModuleMode
  moduleTotal: number
  // 提交 payload 所需配置
  prompt: string
  requirements: string
  productFiles: CreationImage[]
  referenceFiles: CreationImage[]
  model: GenerationModel
  endpointId: string
  aspectRatio: string
  resolution: string
  count: number
  style: GeneralStyle
  referenceStrength: ReferenceStrength
  platform: string
  outputLanguage: string
  moduleCounts: Record<string, number>
  recreateStrength: 'style' | 'high'
  enhancements: string[]
  // 外部动作
  submit: (params: SubmitParams) => Promise<void>
  onLogin: () => void
  setNotice: (notice: GenerationNotice | null) => void
  setHistoryTask: (task: HistoryTask | null) => void
  setHistoryOpen: (open: boolean) => void
  setConfigCollapsed: (collapsed: boolean) => void
  setPanelOpen: (open: boolean) => void
}

/**
 * 工作台的生成流程：校验 → 费用确认 → 提交，以及「重新生成」的二次确认。
 *
 * 提交会真实调用供应商并产生费用，所有入口（生成按钮、历史重生成、
 * 模板/预设载入后的自动重生成）都必须经过这里，避免校验规则分叉。
 */
export function useGenerationFlow({
  mode,
  task,
  hasRecipe,
  expectedCount,
  projectId,
  draftReady,
  templateBlockedReason,
  isSubmitting,
  isGenerating,
  hasProductImage,
  aiEnabled,
  compatibilityIssue,
  referenceFileCount,
  moduleMode,
  moduleTotal,
  prompt,
  requirements,
  productFiles,
  referenceFiles,
  model,
  endpointId,
  aspectRatio,
  resolution,
  count,
  style,
  referenceStrength,
  platform,
  outputLanguage,
  moduleCounts,
  recreateStrength,
  enhancements,
  submit,
  onLogin,
  setNotice,
  setHistoryTask,
  setHistoryOpen,
  setConfigCollapsed,
  setPanelOpen,
}: UseGenerationFlowOptions) {
  // 提交那一刻的产出张数：生成过程中再改参数，加载占位不会跟着变
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [autoRegeneratePending, setAutoRegeneratePending] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // 等历史配置提交到 React 后，再用本轮渲染的参数生成，避免异步回调拿到旧配置。
  useEffect(() => {
    if (!autoRegeneratePending) return
    setAutoRegeneratePending(false)
    createGenerationTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRegeneratePending])

  function buildPayload(productAssetIds: string[], referenceAssetIds: string[]): unknown {
    const commerceCount =
      task === 'product-main' || task === 'detail-page'
        ? moduleMode === 'custom'
          ? Math.max(1, moduleTotal)
          : 1
        : 1
    const imageSettings = {
      projectId,
      model,
      endpointId: endpointId || undefined,
      aspectRatio,
      resolution,
      count: mode === 'general' ? count : commerceCount,
    }

    if (mode === 'general') {
      return {
        mode: 'general',
        prompt,
        referenceAssetIds,
        style,
        referenceStrength,
        ...imageSettings,
      }
    }

    const common = {
      mode: 'commerce',
      taskType: task,
      productAssetIds,
      platform,
      consistencyProtection: true,
      ...imageSettings,
    }

    if (task === 'product-main' || task === 'detail-page')
      return {
        ...common,
        requirements,
        outputLanguage,
        moduleMode,
        moduleCounts,
        ...(hasRecipe && moduleMode === 'custom' ? { moduleOrder: Object.keys(moduleCounts) } : {}),
      }
    if (task === 'viral-recreate')
      return { ...common, referenceAssetIds, recreateStrength, requirements, outputLanguage }
    return { ...common, enhancements, requirements }
  }

  /** 套餐/配方进入生成前先回到配置区，把当前商品图与积分摊开给用户确认 */
  function reviewRecipeCost() {
    setConfigCollapsed(false)
    setPanelOpen(true)
    setNotice({ kind: 'success', message: '请核对当前商品图与积分，再确认生成。' })
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.generate-button')?.focus())
  }

  function createGenerationTask(confirmedQuote?: GenerationQuote) {
    if (isSubmitting || isGenerating) return
    if (!draftReady || templateBlockedReason) {
      setNotice({ kind: 'error', message: templateBlockedReason || '正在恢复草稿，请稍候' })
      return
    }
    if (!getAccessToken()) {
      onLogin()
      return
    }
    if (aiEnabled === false) {
      setNotice({ kind: 'error', message: 'AI 服务尚未配置，请先在后端设置供应商密钥' })
      return
    }
    if (mode === 'commerce' && !hasProductImage) {
      setNotice({ kind: 'error', message: '请先上传商品原图' })
      return
    }
    if (
      hasRecipe &&
      (!confirmedQuote ||
        !confirmedQuote.canAfford ||
        confirmedQuote.modelId !== endpointId ||
        confirmedQuote.quantity !== expectedCount)
    ) {
      reviewRecipeCost()
      return
    }
    if (compatibilityIssue) {
      setConfigCollapsed(false)
      setNotice({ kind: 'error', message: compatibilityIssue })
      return
    }
    if (mode === 'commerce' && task === 'viral-recreate' && referenceFileCount !== 1) {
      setNotice({ kind: 'error', message: '爆款复刻需要上传 1 张参考爆款图' })
      return
    }
    if (
      mode === 'commerce' &&
      (task === 'product-main' || task === 'detail-page') &&
      moduleMode === 'custom' &&
      moduleTotal === 0
    ) {
      setNotice({ kind: 'error', message: '自定义模块至少选择 1 个图片模块' })
      return
    }

    const sourceFiles =
      mode === 'general'
        ? referenceFiles
        : task === 'viral-recreate'
          ? [...productFiles, ...referenceFiles]
          : productFiles
    if (sourceFiles.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setNotice({ kind: 'error', message: '本次上传图片总大小不能超过 20 MB' })
      return
    }

    setSubmittedCount(expectedCount)
    // 从历史查看态发起生成：退出历史查看，右侧回到本次生成的进度
    setHistoryTask(null)
    setHistoryOpen(false)
    void submit({
      productFiles,
      referenceFiles,
      confirmedQuote,
      buildPayload,
      onAuthRequired: onLogin,
      onSubmitted: () => {
        if (hasRecipe && window.matchMedia('(max-width: 780px)').matches) {
          document.querySelector('.result-workspace')?.scrollIntoView({ block: 'start' })
        }
      },
    })
  }

  /** 重新生成前先确认：每次生成都会调用 AI 服务并产生费用 */
  function requestRegenerate() {
    if (hasRecipe) {
      reviewRecipeCost()
      return
    }
    setConfigCollapsed(false)
    if (shouldSkipRegenerateConfirm()) {
      createGenerationTask()
      return
    }
    setConfirmOpen(true)
  }

  function confirmGeneration() {
    setConfirmOpen(false)
    createGenerationTask()
  }

  /** 清空草稿时一并收起所有生成弹窗/自动重生成标记 */
  function resetFlow() {
    setAutoRegeneratePending(false)
    setConfirmOpen(false)
  }

  return {
    submittedCount,
    confirmOpen,
    openConfirm: () => setConfirmOpen(true),
    requestAutoRegenerate: () => setAutoRegeneratePending(true),
    cancelConfirm: () => setConfirmOpen(false),
    confirmGeneration,
    requestRegenerate,
    createGenerationTask,
    reviewRecipeCost,
    resetFlow,
    detailsOpen,
    openDetails: () => setDetailsOpen(true),
    closeDetails: () => setDetailsOpen(false),
  }
}
