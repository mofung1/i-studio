'use client'

import { useMemo } from 'react'

import type { CommerceRecipe } from '@/lib/commerce-recipe'
import type { CreationImage } from '@/lib/creation-images'
import {
  standardCreationDraftSchema,
  type StandardCreationDraft,
} from '@/lib/creation-draft-schema'
import { creationDraftContext, draftEntrySource } from '@/lib/creation-drafts'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'
import type { InspirationTemplate } from '@/lib/inspiration-handoff'

import { useCreationDraft } from './use-creation-draft'
import { useInspirationHandoff } from './use-inspiration-handoff'
import {
  generalMaxCount,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './shared'

interface DraftSearchParams {
  get(name: string): string | null
}

interface UseStandardDraftOptions {
  owner: string
  mode: WorkbenchMode
  task: CommerceTaskType
  searchParams: DraftSearchParams
  recipe?: CommerceRecipe
  initialPrompt?: string
  initialCount?: string
  initialAspectRatio?: string
  initialResolution?: string
  isGenerating: boolean
  isSubmitting: boolean
  // 当前配置
  prompt: string
  requirements: string
  productFiles: CreationImage[]
  referenceFiles: CreationImage[]
  count: number
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
  inspirationTemplate: InspirationTemplate | null
  // 草稿恢复时回填
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
  setInspirationTemplate: (template: InspirationTemplate | null) => void
  // 灵感模板带入后展开配置区
  setConfigCollapsed: (collapsed: boolean) => void
  setPanelOpen: (open: boolean) => void
}

/**
 * 标准工作台的草稿自动保存与灵感模板交接。
 *
 * 草稿按 owner + 工具上下文分键存储；恢复时一次性回填全部配置。灵感模板
 * 带入会先写草稿再消费 URL 参数，避免刷新后重复弹模板。
 */
export function useStandardDraft({
  owner,
  mode,
  task,
  searchParams,
  recipe,
  initialPrompt,
  initialCount,
  initialAspectRatio,
  initialResolution,
  isGenerating,
  isSubmitting,
  prompt,
  requirements,
  productFiles,
  referenceFiles,
  count,
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
  inspirationTemplate,
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
  setConfigCollapsed,
  setPanelOpen,
}: UseStandardDraftOptions) {
  const draftSnapshot = useMemo<StandardCreationDraft>(
    () => ({
      prompt,
      requirements,
      productFiles,
      referenceFiles,
      count,
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
      inspirationTemplate,
    }),
    [
      prompt,
      requirements,
      productFiles,
      referenceFiles,
      count,
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
      inspirationTemplate,
    ],
  )
  const defaultDraft: StandardCreationDraft = {
    prompt: initialPrompt ?? '',
    requirements: recipe?.requirements ?? (mode === 'commerce' ? (initialPrompt ?? '') : ''),
    productFiles: [],
    referenceFiles: [],
    count: Math.min(generalMaxCount, Math.max(1, Number(initialCount) || 1)),
    model,
    endpointId,
    aspectRatio: initialAspectRatio ?? recipe?.aspectRatio ?? '1:1',
    resolution: initialResolution ?? '2K',
    style: 'unspecified',
    referenceStrength: 'medium',
    platform: 'smart',
    outputLanguage: 'none',
    moduleMode: recipe ? 'custom' : 'smart',
    moduleCounts: recipe?.moduleCounts ?? {},
    recreateStrength: 'style',
    enhancements: [],
    inspirationTemplate: null,
  }
  const draft = useCreationDraft({
    owner,
    context: creationDraftContext(
      mode === 'general' ? 'general' : `commerce:${task}`,
      searchParams.get('projectId') ?? '',
      recipe?.id,
    ),
    source: draftEntrySource(searchParams),
    enabled: true,
    value: draftSnapshot,
    defaultValue: defaultDraft,
    emptyValue: { ...defaultDraft, prompt: '', requirements: recipe?.requirements ?? '' },
    parse: (value) => standardCreationDraftSchema.parse(value),
    onRestore: (value) => {
      setPrompt(value.prompt)
      setRequirements(value.requirements)
      setProductFiles(value.productFiles)
      setReferenceFiles(value.referenceFiles)
      setCount(value.count)
      setModel(value.model)
      setEndpointId(value.endpointId)
      setAspectRatio(value.aspectRatio)
      setResolution(value.resolution)
      setStyle(value.style)
      setReferenceStrength(value.referenceStrength)
      setPlatform(value.platform)
      setOutputLanguage(value.outputLanguage)
      setModuleMode(value.moduleMode)
      setModuleCounts(value.moduleCounts)
      setRecreateStrength(value.recreateStrength)
      setEnhancements(value.enhancements)
      setInspirationTemplate(value.inspirationTemplate)
    },
  })
  const restoreHandoff =
    !recipe && draft.ready && draft.restoredSource !== draftEntrySource(searchParams)
  const inspiration = useInspirationHandoff({
    ready: draft.ready && mode === 'general',
    onApply: async (template) => {
      if (isGenerating || isSubmitting) throw new Error('当前任务进行中，请完成后再应用模板')
      const next = { ...draftSnapshot, prompt: template.prompt, inspirationTemplate: template }
      setPrompt(template.prompt)
      setInspirationTemplate(template)
      setConfigCollapsed(false)
      setPanelOpen(true)
      await draft.save(next)
    },
  })
  const templateBlockedReason =
    mode !== 'general'
      ? undefined
      : inspiration.loading
        ? '正在带入灵感模板，请稍候'
        : inspiration.error
          ? '灵感模板尚未带入，请重试或取消带入'
          : inspiration.pending
            ? '请先填写模板变量'
            : inspirationTemplate?.requiresReference && referenceFiles.length === 0
              ? '此模板需要参考图，请先上传自己的素材'
              : undefined

  return { draft, inspiration, restoreHandoff, templateBlockedReason }
}
