'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { deleteGenerationTask } from '@/lib/api'
import type { CreationImage } from '@/lib/creation-images'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'
import type { PublicImageModel } from '@/lib/generation-models'
import { loadStoredImage } from '@/lib/library'

import type { GenerationNotice } from './use-generation-task'
import type { HistoryTask } from './use-task-history'
import { historyWorkbenchUrl } from './use-workbench-handoff'
import { shouldSkipRegenerateConfirm } from './regenerate-dialog'
import {
  generalMaxCount,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'

interface DraftWriter {
  flush: () => Promise<void>
  markEntryApplied: () => void
}

interface UseHistoryConfigOptions {
  mode: WorkbenchMode
  task: CommerceTaskType
  hasRecipe: boolean
  currentToolUrl: string
  draft: DraftWriter
  mounted: { current: boolean }
  requestRef: { current: number }
  imageEndpoints: PublicImageModel[]
  isSubmitting: boolean
  isGenerating: boolean
  historyTask: HistoryTask | null
  // 历史配置回填到工作台表单
  setMode: (mode: WorkbenchMode) => void
  setTask: (task: CommerceTaskType) => void
  setPrompt: (prompt: string) => void
  setRequirements: (requirements: string) => void
  setProductFiles: (files: CreationImage[]) => void
  setReferenceFiles: (files: CreationImage[]) => void
  setCount: (count: number) => void
  setModel: (model: GenerationModel) => void
  setEndpointId: (id: string) => void
  setAspectRatio: (ratio: string) => void
  setResolution: (resolution: string) => void
  setStyle: (style: GeneralStyle) => void
  setReferenceStrength: (strength: ReferenceStrength) => void
  setPlatform: (platform: string) => void
  setOutputLanguage: (language: string) => void
  setModuleMode: (mode: ModuleMode) => void
  setModuleCounts: (counts: Record<string, number>) => void
  setRecreateStrength: (strength: 'style' | 'high') => void
  setEnhancements: (enhancements: string[]) => void
  setInspirationTemplate: (template: null) => void
  revealConfig: (mode: WorkbenchMode) => void
  setNotice: (notice: GenerationNotice | null) => void
  setHistoryTask: (task: HistoryTask | null) => void
  setHistoryOpen: (open: boolean) => void
  removeResult: (id: string) => void
  // 重新生成流程
  reviewRecipeCost: () => void
  requestAutoRegenerate: () => void
  openConfirm: () => void
}

/**
 * 历史记录 → 当前工作台配置的回填，以及从历史记录重新生成/删除的流程。
 *
 * 历史任务里的素材存的是 assetId，读回时要重新拉取成可编辑文件；跨工具
 * 的历史记录会先保存草稿再跳转到对应工具，不能在当前表单里静默切换。
 */
export function useHistoryConfig({
  mode,
  task,
  hasRecipe,
  currentToolUrl,
  draft,
  mounted,
  requestRef,
  imageEndpoints,
  isSubmitting,
  isGenerating,
  historyTask,
  setMode,
  setTask,
  setPrompt,
  setRequirements,
  setProductFiles,
  setReferenceFiles,
  setCount,
  setModel,
  setEndpointId,
  setAspectRatio,
  setResolution,
  setStyle,
  setReferenceStrength,
  setPlatform,
  setOutputLanguage,
  setModuleMode,
  setModuleCounts,
  setRecreateStrength,
  setEnhancements,
  setInspirationTemplate,
  revealConfig,
  setNotice,
  setHistoryTask,
  setHistoryOpen,
  removeResult,
  reviewRecipeCost,
  requestAutoRegenerate,
  openConfirm,
}: UseHistoryConfigOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loadingConfigId, setLoadingConfigId] = useState<string | null>(null)
  // 切换生图类型会重置结果作用域并顺带清空提示，这里把提示延后到切换完成后再显示
  const pendingNoticeRef = useRef<GenerationNotice | null>(null)

  useEffect(() => {
    if (!pendingNoticeRef.current) return
    setNotice(pendingNoticeRef.current)
    pendingNoticeRef.current = null
    // 依赖 mode/task：类型切换完成后才把提示补上
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, task])

  /** 历史任务里存的是 assetId，需要按 id 取回内容才能还原成可编辑的素材 */
  async function fetchAssetFiles(assetIds: string[]) {
    if (assetIds.length === 0) return []
    return Promise.all(assetIds.map((assetId) => loadStoredImage(`/v1/assets/${assetId}/content`)))
  }

  /** 载入一条历史记录的配置，继续在当前工作台里编辑 */
  async function loadHistoryConfig(historyTaskToLoad: HistoryTask) {
    if (
      historyTaskToLoad.input.taskType === 'clothing-set' ||
      (historyTaskToLoad.input.projectId &&
        historyTaskToLoad.input.projectId !== searchParams.get('projectId')) ||
      (historyTaskToLoad.input.mode === 'commerce' ? 'commerce' : 'general') !== mode ||
      (mode === 'commerce' && historyTaskToLoad.input.taskType !== task)
    ) {
      try {
        await draft.flush()
      } catch {
        setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再切换工具' })
        return false
      }
      if (!mounted.current) return false
      router.replace(historyWorkbenchUrl(historyTaskToLoad, false, searchParams))
      return false
    }
    const requestId = ++requestRef.current
    const input = historyTaskToLoad.input
    setLoadingConfigId(historyTaskToLoad.id)
    setNotice(null)
    try {
      const [nextProductFiles, nextReferenceFiles] = await Promise.all([
        fetchAssetFiles(input.productAssetIds ?? []),
        fetchAssetFiles(input.referenceAssetIds ?? []),
      ])
      if (requestId !== requestRef.current) return false
      const nextMode: WorkbenchMode = input.mode === 'commerce' ? 'commerce' : 'general'
      const nextTask: CommerceTaskType = (
        ['product-main', 'detail-page', 'viral-recreate', 'product-retouch'] as CommerceTaskType[]
      ).includes(input.taskType as CommerceTaskType)
        ? (input.taskType as CommerceTaskType)
        : 'product-main'

      setMode(nextMode)
      setTask(nextTask)
      revealConfig(nextMode)
      setPrompt(input.prompt ?? '')
      setRequirements(input.requirements ?? '')
      setPlatform(input.platform ?? 'smart')
      setOutputLanguage(input.outputLanguage ?? 'none')
      setStyle((input.style as GeneralStyle) ?? 'unspecified')
      setReferenceStrength((input.referenceStrength as ReferenceStrength) ?? 'medium')
      setModuleMode((input.moduleMode as ModuleMode) ?? 'smart')
      setModuleCounts(input.moduleCounts ?? {})
      setRecreateStrength(input.recreateStrength === 'high' ? 'high' : 'style')
      setEnhancements(input.enhancements ?? [])
      setCount(Math.min(generalMaxCount, Math.max(1, Number(input.count) || 1)))
      const selectedEndpoint =
        imageEndpoints.find((endpoint) => endpoint.id === input.endpointId) ??
        imageEndpoints.find((endpoint) => endpoint.model === input.model) ??
        imageEndpoints.find((endpoint) => endpoint.isDefault)
      if (selectedEndpoint) {
        setModel(selectedEndpoint.model)
        setEndpointId(selectedEndpoint.id)
      }
      setAspectRatio(input.aspectRatio ?? '1:1')
      setResolution(input.resolution ?? '2K')
      setProductFiles(nextProductFiles)
      setReferenceFiles(nextReferenceFiles)
      setInspirationTemplate(null)
      draft.markEntryApplied()
      setHistoryTask(null)
      setHistoryOpen(false)
      router.replace(currentToolUrl)
      const message = '已载入历史记录的配置，可继续调整后生成'
      if (nextMode === mode && (nextMode === 'general' || nextTask === task))
        setNotice({ kind: 'success', message })
      else pendingNoticeRef.current = { kind: 'success', message }
      return true
    } catch (error) {
      if (requestId === requestRef.current)
        setNotice({
          kind: 'error',
          message: error instanceof Error ? error.message : '载入配置失败',
        })
      return false
    } finally {
      if (requestId === requestRef.current) setLoadingConfigId(null)
    }
  }

  /** 用一条历史记录自己的配置再生成一次：先回填配置，再走二次确认 */
  async function regenerateFromHistory(historyTaskToLoad: HistoryTask) {
    if (isSubmitting || isGenerating) {
      setNotice({ kind: 'error', message: '当前任务正在生成，请完成后再重新生成' })
      return
    }
    if (
      historyTaskToLoad.input.taskType === 'clothing-set' ||
      (historyTaskToLoad.input.projectId &&
        historyTaskToLoad.input.projectId !== searchParams.get('projectId')) ||
      (historyTaskToLoad.input.mode === 'commerce' ? 'commerce' : 'general') !== mode ||
      (mode === 'commerce' && historyTaskToLoad.input.taskType !== task)
    ) {
      try {
        await draft.flush()
      } catch {
        setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再切换工具' })
        return
      }
      if (!mounted.current) return
      router.replace(historyWorkbenchUrl(historyTaskToLoad, true, searchParams))
      return
    }
    const loaded = await loadHistoryConfig(historyTaskToLoad)
    if (!loaded) return
    if (hasRecipe) {
      reviewRecipeCost()
      return
    }
    if (shouldSkipRegenerateConfirm()) {
      requestAutoRegenerate()
      return
    }
    // 与上一批 state 更新同一批提交，弹窗里展示的就是刚载入的配置
    openConfirm()
  }

  /** 删除一条历史记录（连同它生成的结果图片） */
  async function deleteHistoryTask(record: HistoryTask) {
    setNotice(null)
    try {
      await deleteGenerationTask(record.id)
      removeResult(record.id)
      if (historyTask?.id === record.id) {
        setHistoryTask(null)
        setHistoryOpen(false)
      }
      setNotice({ kind: 'success', message: '已删除这条记录' })
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '删除失败，请稍后重试',
      })
      throw error
    }
  }

  return {
    loadingConfigId,
    setLoadingConfigId,
    loadHistoryConfig,
    regenerateFromHistory,
    deleteHistoryTask,
  }
}
