'use client'

import { useEffect, useState } from 'react'

import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'
import type { PublicImageModel } from '@/lib/generation-models'
import {
  resolvePresetEndpoint,
  type CreationPreset,
  type PersonalApplication,
} from '@/lib/personal-prompts'

import type { GenerationNotice } from './use-generation-task'
import { usePersonalPromptHandoff } from './use-personal-prompt-handoff'
import type { GeneralStyle, ModuleMode, ReferenceStrength, WorkbenchMode } from './shared'

interface DraftWriter {
  markEntryApplied: () => void
}

interface UsePersonalApplicationOptions {
  mode: WorkbenchMode
  task: CommerceTaskType
  isSubmitting: boolean
  isGenerating: boolean
  aiEnabled: boolean | null
  restoreHandoff: boolean
  imageEndpoints: PublicImageModel[]
  // 当前配置（用于生成撤销快照）
  expectedCount: number
  model: GenerationModel
  endpointId: string
  aspectRatio: string
  resolution: string
  style: GeneralStyle
  referenceStrength: ReferenceStrength
  platform: string
  outputLanguage: string
  moduleMode: ModuleMode
  moduleCounts: Record<string, number>
  recreateStrength: 'style' | 'high'
  enhancements: string[]
  prompt: string
  requirements: string
  // 应用预设
  setPrompt: (prompt: string) => void
  setRequirements: (requirements: string) => void
  setEndpointId: (id: string) => void
  setModel: (model: GenerationModel) => void
  setAspectRatio: (ratio: string) => void
  setResolution: (resolution: string) => void
  setCount: (count: number) => void
  setStyle: (style: GeneralStyle) => void
  setReferenceStrength: (strength: ReferenceStrength) => void
  setPlatform: (platform: string) => void
  setOutputLanguage: (language: string) => void
  setModuleMode: (mode: ModuleMode) => void
  setModuleCounts: (counts: Record<string, number>) => void
  setRecreateStrength: (strength: 'style' | 'high') => void
  setEnhancements: (enhancements: string[]) => void
  setConfigCollapsed: (collapsed: boolean) => void
  setInspirationTemplate: (template: null) => void
  draft: DraftWriter
  setNotice: (notice: GenerationNotice | null) => void
}

/**
 * 「我的提示词」在工作台里的应用与撤销。
 *
 * 应用预设会替换描述与相关参数；撤销依赖应用前的完整快照，所以快照必须
 * 在写任何 state 之前取好，避免同一批更新里读到新值。
 */
export function usePersonalApplication({
  mode,
  task,
  isSubmitting,
  isGenerating,
  aiEnabled,
  restoreHandoff,
  imageEndpoints,
  expectedCount,
  model,
  endpointId,
  aspectRatio,
  resolution,
  style,
  referenceStrength,
  platform,
  outputLanguage,
  moduleMode,
  moduleCounts,
  recreateStrength,
  enhancements,
  prompt,
  requirements,
  setPrompt,
  setRequirements,
  setEndpointId,
  setModel,
  setAspectRatio,
  setResolution,
  setCount,
  setStyle,
  setReferenceStrength,
  setPlatform,
  setOutputLanguage,
  setModuleMode,
  setModuleCounts,
  setRecreateStrength,
  setEnhancements,
  setConfigCollapsed,
  setInspirationTemplate,
  draft,
  setNotice,
}: UsePersonalApplicationOptions) {
  const [collectionUndo, setCollectionUndo] = useState<PersonalApplication | null>(null)
  useEffect(() => setCollectionUndo(null), [mode, task])

  function currentPreset(): CreationPreset {
    const base = {
      mode,
      model,
      ...(endpointId ? { endpointId } : {}),
      aspectRatio,
      resolution,
      count: expectedCount,
    }
    if (mode === 'general') return { ...base, style, referenceStrength } as CreationPreset
    return {
      ...base,
      taskType: task,
      platform,
      outputLanguage,
      ...(task === 'product-main' || task === 'detail-page'
        ? { moduleMode, moduleCounts: { ...moduleCounts } }
        : {}),
      ...(task === 'viral-recreate' ? { recreateStrength } : {}),
      ...(task === 'product-retouch' ? { enhancements: [...enhancements] } : {}),
    } as CreationPreset
  }

  function applyCollection(application: PersonalApplication, restore = false) {
    if (isSubmitting || isGenerating) throw new Error('当前正在生成，请完成后再应用')
    const config = application.config
    if (config && (config.mode !== mode || (mode === 'commerce' && config.taskType !== task)))
      throw new Error('该预设属于其他工具，请从“我的提示词”页面应用')
    const maximum =
      mode === 'general'
        ? 10000
        : task === 'viral-recreate' || task === 'product-retouch'
          ? 1000
          : 2000
    if (application.text.length > maximum) throw new Error(`当前工具的描述最多 ${maximum} 字`)
    const endpoint = config ? resolvePresetEndpoint(config, imageEndpoints) : null
    if (!restore)
      setCollectionUndo({
        text: mode === 'general' ? prompt : requirements,
        config: currentPreset(),
        title: '应用前的配置',
      })
    if (restore || !config || application.text.trim()) {
      if (mode === 'general') setPrompt(application.text)
      else setRequirements(application.text)
    }
    if (config && endpoint) {
      setEndpointId(endpoint.id)
      setModel(endpoint.model)
      setAspectRatio(config.aspectRatio)
      setResolution(config.resolution)
      if (mode === 'general') {
        setCount(config.count)
        setStyle(config.style ?? 'unspecified')
        setReferenceStrength(config.referenceStrength ?? 'medium')
      } else {
        setPlatform(config.platform ?? 'smart')
        setOutputLanguage(config.outputLanguage ?? 'none')
        setModuleMode(config.moduleMode ?? 'smart')
        setModuleCounts({ ...config.moduleCounts })
        setRecreateStrength(config.recreateStrength ?? 'style')
        setEnhancements(config.enhancements ?? [])
      }
    }
    setConfigCollapsed(false)
    setInspirationTemplate(null)
    draft.markEntryApplied()
    setNotice({
      kind: 'success',
      message: restore ? '已撤销应用' : `已应用“${application.title}”，可继续编辑或撤销`,
    })
  }

  usePersonalPromptHandoff({
    ready: aiEnabled !== null && restoreHandoff && !isGenerating && !isSubmitting,
    onApply: (application) => applyCollection(application),
    onError: (message) => setNotice({ kind: 'error', message }),
  })

  function undoCollection() {
    if (!collectionUndo) return
    try {
      applyCollection(collectionUndo, true)
      setCollectionUndo(null)
    } catch (reason) {
      setNotice({
        kind: 'error',
        message: reason instanceof Error ? reason.message : '撤销失败',
      })
    }
  }

  return {
    collectionUndo,
    currentPreset,
    applyCollection,
    undoCollection,
    clearCollectionUndo: () => setCollectionUndo(null),
  }
}
