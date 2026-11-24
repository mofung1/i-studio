import { useState, useMemo } from 'react'
import type { CreationImage } from '@/lib/creation-images'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'
import type { InspirationTemplate } from '@/lib/inspiration-handoff'
import type { GeneralStyle, ModuleMode, ReferenceStrength, WorkbenchMode } from './shared'
import { generalMaxCount } from './shared'

/**
 * 工作台配置状态
 *
 * 包含所有生成参数的状态管理
 */
export interface WorkbenchConfig {
  // 基础配置
  mode: WorkbenchMode
  task: CommerceTaskType

  // 创作内容
  prompt: string
  requirements: string
  productFiles: CreationImage[]
  referenceFiles: CreationImage[]
  inspirationTemplate: InspirationTemplate | null

  // 生成参数
  count: number
  model: GenerationModel
  endpointId: string
  aspectRatio: string
  resolution: string

  // 风格与增强
  style: GeneralStyle
  referenceStrength: ReferenceStrength
  platform: string
  outputLanguage: string
  moduleMode: ModuleMode
  moduleCounts: Record<string, number>
  recreateStrength: 'style' | 'high'
  enhancements: string[]

  // AI 辅助
  promptEnhanceEnabled: boolean
  promptVision: boolean
}

/**
 * 工作台配置状态 Hook
 *
 * 集中管理工作台的所有配置参数，避免组件中散落大量 useState
 *
 * @example
 * ```tsx
 * const { config, updateConfig, resetConfig } = useWorkbenchConfig({
 *   initialMode: 'general',
 *   initialTask: 'product-main',
 * })
 *
 * // 更新单个字段
 * updateConfig({ prompt: '新的提示词' })
 *
 * // 更新多个字段
 * updateConfig({
 *   model: 'gpt-image-3',
 *   aspectRatio: '16:9'
 * })
 * ```
 */
export function useWorkbenchConfig(options: {
  initialMode: WorkbenchMode
  initialTask: CommerceTaskType
  initialPrompt?: string
  initialModel?: string
  initialAspectRatio?: string
  initialResolution?: string
  initialCount?: string
  recipeRequirements?: string
  recipeAspectRatio?: string
  recipeModuleCounts?: Record<string, number>
  recipeModuleMode?: ModuleMode
}) {
  const {
    initialMode,
    initialTask,
    initialPrompt,
    initialModel,
    initialAspectRatio,
    initialResolution,
    initialCount,
    recipeRequirements,
    recipeAspectRatio,
    recipeModuleCounts,
    recipeModuleMode,
  } = options

  // 基础配置
  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)

  // 创作内容
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [inspirationTemplate, setInspirationTemplate] = useState<InspirationTemplate | null>(null)
  const [requirements, setRequirements] = useState<string>(recipeRequirements ?? '')
  const [productFiles, setProductFiles] = useState<CreationImage[]>([])
  const [referenceFiles, setReferenceFiles] = useState<CreationImage[]>([])

  // 生成参数
  const [count, setCount] = useState(() =>
    Math.min(generalMaxCount, Math.max(1, Number(initialCount) || 1)),
  )
  const [model, setModel] = useState<GenerationModel>(
    (initialModel as GenerationModel) ?? 'gpt-image-2',
  )
  const [endpointId, setEndpointId] = useState('')
  const [aspectRatio, setAspectRatio] = useState(
    initialAspectRatio ?? recipeAspectRatio ?? '1:1',
  )
  const [resolution, setResolution] = useState(initialResolution ?? '2K')

  // 风格与增强
  const [style, setStyle] = useState<GeneralStyle>('unspecified')
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrength>('medium')
  const [platform, setPlatform] = useState('smart')
  const [outputLanguage, setOutputLanguage] = useState('none')
  const [moduleMode, setModuleMode] = useState<ModuleMode>(recipeModuleMode ?? 'smart')
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>(
    recipeModuleCounts ?? {},
  )
  const [recreateStrength, setRecreateStrength] = useState<'style' | 'high'>('style')
  const [enhancements, setEnhancements] = useState<string[]>([])

  // AI 辅助
  const [promptEnhanceEnabled, setPromptEnhanceEnabled] = useState(false)
  const [promptVision, setPromptVision] = useState(false)

  // 合并为统一的配置对象
  const config: WorkbenchConfig = useMemo(
    () => ({
      mode,
      task,
      prompt,
      requirements,
      productFiles,
      referenceFiles,
      inspirationTemplate,
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
      promptEnhanceEnabled,
      promptVision,
    }),
    [
      mode,
      task,
      prompt,
      requirements,
      productFiles,
      referenceFiles,
      inspirationTemplate,
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
      promptEnhanceEnabled,
      promptVision,
    ],
  )

  /**
   * 批量更新配置
   *
   * 只更新提供的字段，未提供的字段保持不变
   */
  function updateConfig(updates: Partial<WorkbenchConfig>) {
    if ('mode' in updates && updates.mode !== undefined) setMode(updates.mode)
    if ('task' in updates && updates.task !== undefined) setTask(updates.task)
    if ('prompt' in updates && updates.prompt !== undefined) setPrompt(updates.prompt)
    if ('requirements' in updates && updates.requirements !== undefined)
      setRequirements(updates.requirements)
    if ('productFiles' in updates && updates.productFiles !== undefined)
      setProductFiles(updates.productFiles)
    if ('referenceFiles' in updates && updates.referenceFiles !== undefined)
      setReferenceFiles(updates.referenceFiles)
    if ('inspirationTemplate' in updates && updates.inspirationTemplate !== undefined)
      setInspirationTemplate(updates.inspirationTemplate)
    if ('count' in updates && updates.count !== undefined) setCount(updates.count)
    if ('model' in updates && updates.model !== undefined) setModel(updates.model)
    if ('endpointId' in updates && updates.endpointId !== undefined)
      setEndpointId(updates.endpointId)
    if ('aspectRatio' in updates && updates.aspectRatio !== undefined)
      setAspectRatio(updates.aspectRatio)
    if ('resolution' in updates && updates.resolution !== undefined)
      setResolution(updates.resolution)
    if ('style' in updates && updates.style !== undefined) setStyle(updates.style)
    if ('referenceStrength' in updates && updates.referenceStrength !== undefined)
      setReferenceStrength(updates.referenceStrength)
    if ('platform' in updates && updates.platform !== undefined) setPlatform(updates.platform)
    if ('outputLanguage' in updates && updates.outputLanguage !== undefined)
      setOutputLanguage(updates.outputLanguage)
    if ('moduleMode' in updates && updates.moduleMode !== undefined)
      setModuleMode(updates.moduleMode)
    if ('moduleCounts' in updates && updates.moduleCounts !== undefined)
      setModuleCounts(updates.moduleCounts)
    if ('recreateStrength' in updates && updates.recreateStrength !== undefined)
      setRecreateStrength(updates.recreateStrength)
    if ('enhancements' in updates && updates.enhancements !== undefined)
      setEnhancements(updates.enhancements)
    if ('promptEnhanceEnabled' in updates && updates.promptEnhanceEnabled !== undefined)
      setPromptEnhanceEnabled(updates.promptEnhanceEnabled)
    if ('promptVision' in updates && updates.promptVision !== undefined)
      setPromptVision(updates.promptVision)
  }

  /**
   * 重置配置到初始状态
   */
  function resetConfig() {
    setMode(initialMode)
    setTask(initialTask)
    setPrompt(initialPrompt ?? '')
    setInspirationTemplate(null)
    setRequirements(recipeRequirements ?? '')
    setProductFiles([])
    setReferenceFiles([])
    setCount(Math.min(generalMaxCount, Math.max(1, Number(initialCount) || 1)))
    setModel((initialModel as GenerationModel) ?? 'gpt-image-2')
    setEndpointId('')
    setAspectRatio(initialAspectRatio ?? recipeAspectRatio ?? '1:1')
    setResolution(initialResolution ?? '2K')
    setStyle('unspecified')
    setReferenceStrength('medium')
    setPlatform('smart')
    setOutputLanguage('none')
    setModuleMode(recipeModuleMode ?? 'smart')
    setModuleCounts(recipeModuleCounts ?? {})
    setRecreateStrength('style')
    setEnhancements([])
    setPromptEnhanceEnabled(false)
    setPromptVision(false)
  }

  return {
    config,
    updateConfig,
    resetConfig,

    // 保留单独的 setters 以便向后兼容
    setMode,
    setTask,
    setPrompt,
    setRequirements,
    setProductFiles,
    setReferenceFiles,
    setInspirationTemplate,
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
    setPromptEnhanceEnabled,
    setPromptVision,
  }
}
