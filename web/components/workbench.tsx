'use client'

import { addCreationImage, type CreationImage } from '@/lib/creation-images'
import { commerceRecipeUrl, getCommerceRecipe, type CommerceRecipe } from '@/lib/commerce-recipe'
import type { GenerationQuote } from '@/lib/credits'
import { studioToolUrl } from '@/lib/studio-navigation'
import {
  creationDraftContext,
  draftEntrySource,
  prepareGuestDraftLogin,
} from '@/lib/creation-drafts'
import {
  standardCreationDraftSchema,
  type StandardCreationDraft,
} from '@/lib/creation-draft-schema'
import type { InspirationTemplate } from '@/lib/inspiration-handoff'
import { useCreationDraft } from './workbench/use-creation-draft'
import { CreationDraftStatus } from './workbench/creation-draft-status'
import { WorkbenchSkeleton } from './workbench/workbench-skeleton'
import { useInspirationHandoff } from './workbench/use-inspiration-handoff'
import {
  InspirationHandoffStatus,
  InspirationTemplateNotice,
} from './workbench/inspiration-template-notice'
import { AccountAccess } from './account-access'
import { modelCompatibilityIssue, type PublicImageModel } from '@/lib/generation-models'
import { loadStoredImage } from '@/lib/library'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { apiBaseUrl, deleteGenerationTask, getAccessToken, readApiError } from '@/lib/api'

import { InfoDialog } from './info-dialog'
import { useAccount } from './account-provider'
import { CreatorSidebar } from './workbench/creator-sidebar'
import { ClothingWorkbench } from './workbench/clothing-workbench'
import {
  RegenerateDialog,
  shouldSkipRegenerateConfirm,
  type RegenerateRow,
} from './workbench/regenerate-dialog'
import { ResultWorkspace } from './workbench/result-workspace'
import { CreationStarter } from './workbench/creation-starter'
import { WorkbenchHeader } from './workbench/workbench-header'
import { WorkbenchRail } from './workbench/workbench-rail'
import { useCreatorPreferences } from './workbench/use-creator-preferences'
import { useGenerationTask, type GenerationNotice } from './workbench/use-generation-task'
import {
  historyWorkbenchUrl,
  referenceWorkbenchUrl,
  useWorkbenchHandoff,
} from './workbench/use-workbench-handoff'
import { useReversePromptHandoff } from './workbench/use-reverse-prompt-handoff'
import { applyReverseText } from '@/lib/prompt-reverse'
import {
  resolvePresetEndpoint,
  type CreationPreset,
  type PersonalApplication,
} from '@/lib/personal-prompts'
import { CreationLibraryTools } from './workbench/creation-library-tools'
import { usePersonalPromptHandoff } from './workbench/use-personal-prompt-handoff'
import type { HistoryTask } from './workbench/use-task-history'
import {
  detailModules,
  generalMaxCount,
  modelOptions,
  optionLabel,
  platformOptions,
  referenceLimit,
  productMainModules,
  styleOptions,
  taskMeta,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './workbench/shared'

interface WorkbenchProps {
  initialMode: WorkbenchMode
  initialTask: CommerceTaskType
  initialPrompt?: string
  initialModel?: string
  initialAspectRatio?: string
  initialResolution?: string
  initialCount?: string
}

export function Workbench(props: WorkbenchProps) {
  const { account, loading, error } = useAccount()
  const search = useSearchParams()
  if (loading) return <WorkbenchSkeleton mode={props.initialMode} />
  if (error && !account.authenticated)
    return <AccountAccess title="恢复创作草稿" description="确认账号后即可恢复草稿。" />
  const owner = account.user?.id ?? 'guest'
  const selectedRecipe = getCommerceRecipe(search.get('recipe'))
  const recipe =
    props.initialMode === 'commerce' && selectedRecipe?.task === props.initialTask
      ? selectedRecipe
      : undefined
  const tool = props.initialMode === 'general' ? 'general' : `commerce:${props.initialTask}`
  const key = `${owner}:${creationDraftContext(tool, search.get('projectId') ?? '', recipe?.id)}`
  return props.initialMode === 'commerce' && props.initialTask === 'clothing-set' ? (
    <ClothingWorkbench
      key={key}
      recipe={recipe?.task === 'clothing-set' ? recipe : undefined}
      initialModel={props.initialModel}
      initialAspectRatio={props.initialAspectRatio}
      initialResolution={props.initialResolution}
    />
  ) : (
    <StandardWorkbench key={key} {...props} recipe={recipe} />
  )
}

function StandardWorkbench({
  initialMode,
  initialPrompt,
  initialTask,
  initialModel,
  initialAspectRatio,
  initialResolution,
  initialCount,
  recipe,
}: WorkbenchProps & { recipe?: CommerceRecipe }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { account } = useAccount()

  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)
  const currentToolUrl = recipe
    ? commerceRecipeUrl(recipe, searchParams)
    : studioToolUrl(mode, task, searchParams)
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [inspirationTemplate, setInspirationTemplate] = useState<InspirationTemplate | null>(null)
  const [requirements, setRequirements] = useState<string>(recipe?.requirements ?? '')
  const [productFiles, setProductFiles] = useState<CreationImage[]>([])
  const [referenceFiles, setReferenceFiles] = useState<CreationImage[]>([])
  const [count, setCount] = useState(() =>
    Math.min(generalMaxCount, Math.max(1, Number(initialCount) || 1)),
  )
  const [model, setModel] = useState<GenerationModel>(
    (initialModel as GenerationModel) ?? 'gpt-image-2',
  )
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? recipe?.aspectRatio ?? '1:1')
  const [resolution, setResolution] = useState(initialResolution ?? '2K')
  const [style, setStyle] = useState<GeneralStyle>('unspecified')
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrength>('medium')
  const [platform, setPlatform] = useState('smart')
  const [outputLanguage, setOutputLanguage] = useState('none')
  const initialModuleMode = recipe ? 'custom' : 'smart'
  const [moduleMode, setModuleMode] = useState<ModuleMode>(initialModuleMode)
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>(
    recipe?.moduleCounts ?? {},
  )
  const [recreateStrength, setRecreateStrength] = useState<'style' | 'high'>('style')
  const [enhancements, setEnhancements] = useState<string[]>([])
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [promptEnhanceEnabled, setPromptEnhanceEnabled] = useState(false)
  const [promptVision, setPromptVision] = useState(false)
  const [imageEndpoints, setImageEndpoints] = useState<PublicImageModel[]>([])
  const [endpointId, setEndpointId] = useState('')
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState('')
  const [modelsRevision, setModelsRevision] = useState(0)
  const selectedEndpointRef = useRef(endpointId)
  selectedEndpointRef.current = endpointId
  const [panelOpen, setPanelOpen] = useState(Boolean(recipe))
  const generalLayout = useCreatorPreferences()
  const commerceLayout = useCreatorPreferences('commerce')
  const creatorLayout = mode === 'general' ? generalLayout : commerceLayout
  const { collapsed: configCollapsed, setCollapsed: setConfigCollapsed } = creatorLayout
  useEffect(() => {
    if (recipe) setConfigCollapsed(false)
  }, [recipe, setConfigCollapsed])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTask, setHistoryTask] = useState<HistoryTask | null>(null)
  const [loadingConfigId, setLoadingConfigId] = useState<string | null>(null)
  // 提交那一刻的产出张数：生成过程中再改参数，加载占位不会跟着变
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [autoRegeneratePending, setAutoRegeneratePending] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [collectionUndo, setCollectionUndo] = useState<PersonalApplication | null>(null)
  useEffect(() => setCollectionUndo(null), [mode, task])
  // 切换生图类型会重置结果作用域并顺带清空提示，这里把提示延后到切换完成后再显示
  const pendingNoticeRef = useRef<GenerationNotice | null>(null)
  const configurationRequestRef = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      configurationRequestRef.current++
    }
  }, [])
  const currentImages = useRef({ productFiles, referenceFiles })
  currentImages.current = { productFiles, referenceFiles }

  const {
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
    removeResult,
  } = useGenerationTask(
    recipe
      ? `${mode}:${task}:${recipe.id}:${searchParams.get('projectId') ?? ''}`
      : `${mode}:${task}`,
    { restoreLatest: !recipe },
  )

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
    requirements: recipe?.requirements ?? '',
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
    moduleMode: initialModuleMode,
    moduleCounts: recipe?.moduleCounts ?? {},
    recreateStrength: 'style',
    enhancements: [],
    inspirationTemplate: null,
  }
  const draft = useCreationDraft({
    owner: account.user?.id ?? 'guest',
    context: creationDraftContext(
      mode === 'general' ? 'general' : `commerce:${task}`,
      searchParams.get('projectId') ?? '',
      recipe?.id,
    ),
    source: draftEntrySource(searchParams),
    enabled: true,
    value: draftSnapshot,
    defaultValue: defaultDraft,
    emptyValue: { ...defaultDraft, prompt: '' },
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

  const hasProductImage = productFiles.length > 0
  const compatibilityIssue = modelCompatibilityIssue(
    imageEndpoints.find((endpoint) => endpoint.id === endpointId),
    {
      aspectRatio,
      resolution,
      hasImages: mode === 'general' ? referenceFiles.length > 0 : productFiles.length > 0,
      requiresImages: mode === 'commerce',
    },
  )
  useWorkbenchHandoff({
    ready: aiEnabled !== null && restoreHandoff,
    onHistory: (record, review) =>
      review ? regenerateFromHistory(record) : loadHistoryConfig(record),
    onReference: (path) => useImageAsReference(path, { mode, taskType: task }),
    onError: (message) => setNotice({ kind: 'error', message }),
  })
  useReversePromptHandoff({
    ready: aiEnabled !== null && restoreHandoff && mode === 'general',
    onApply: (text, file) => {
      if (file && referenceFiles.length >= referenceLimit('general', task))
        throw new Error('参考图已达上限，请先移除一张再应用反推结果')
      setPrompt((previous) =>
        applyReverseText(previous, text, previous.trim() ? 'append' : 'replace'),
      )
      if (file) setReferenceFiles((previous) => [...previous, file])
      setInspirationTemplate(null)
      draft.markEntryApplied()
      setConfigCollapsed(false)
      setNotice({ kind: 'success', message: '反推提示词已填入，可调整后开始生成' })
    },
    onError: (message) => setNotice({ kind: 'error', message }),
  })

  // 等历史配置提交到 React 后，再用本轮渲染的参数生成，避免异步回调拿到旧配置。
  useEffect(() => {
    if (!autoRegeneratePending) return
    setAutoRegeneratePending(false)
    createGenerationTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRegeneratePending])

  useEffect(() => {
    if (!draft.ready) return
    let current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    setModelsLoading(true)
    setModelsError('')
    setAiEnabled(null)
    fetch(`${apiBaseUrl}/v1/generation/capabilities`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, '模型列表读取失败，请重试'))
        return response.json()
      })
      .then(
        (data: {
          aiEnabled?: boolean
          promptEnhanceEnabled?: boolean
          promptVision?: boolean
          imageEndpoints?: PublicImageModel[]
          creditName?: string
        }) => {
          if (!current) return
          const endpoints = (data.imageEndpoints ?? []).map((endpoint) => ({
            ...endpoint,
            creditName: data.creditName ?? '积分',
          }))
          setAiEnabled(Boolean(data.aiEnabled) && endpoints.length > 0)
          setPromptEnhanceEnabled(Boolean(data.promptEnhanceEnabled))
          setPromptVision(Boolean(data.promptVision))
          setImageEndpoints(endpoints)
          if (draft.restorationFailed) return
          const selected = selectedEndpointRef.current
            ? endpoints.find((endpoint) => endpoint.id === selectedEndpointRef.current)
            : (endpoints.find(
                (endpoint) => endpoint.id === initialModel || endpoint.model === initialModel,
              ) ??
              endpoints.find((endpoint) => endpoint.isDefault) ??
              endpoints[0])
          if (selected) {
            setEndpointId(selected.id)
            setModel(selected.model)
          } else if (!selectedEndpointRef.current) {
            setEndpointId('')
            setModel('')
          }
        },
      )
      .catch((error) => {
        if (!current) return
        setAiEnabled(false)
        setImageEndpoints([])
        setModelsError(
          controller.signal.aborted
            ? '模型列表读取超时，请重试'
            : error instanceof Error
              ? error.message
              : '模型列表读取失败，请重试',
        )
      })
      .finally(() => {
        clearTimeout(timeout)
        if (current) setModelsLoading(false)
      })
    return () => {
      current = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [modelsRevision, initialModel, draft.ready, draft.restorationFailed])

  useEffect(() => {
    if (!pendingNoticeRef.current) return
    setNotice(pendingNoticeRef.current)
    pendingNoticeRef.current = null
    // 依赖 mode/task：类型切换完成后才把提示补上
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, task])

  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '图片' : currentTask.title
  // 主图与详情页共用 hero/selling/scene/detail 这些 key，各自又有独有 key。
  // 切换任务时不清 moduleCounts，所以先按当前任务的模块过滤，避免别的任务的残留计数混进总数与 16 上限。
  const currentModuleKeys =
    task === 'product-main'
      ? productMainModules.map(([value]) => value)
      : detailModules.map(([value]) => value)
  const activeModuleCounts = Object.fromEntries(
    Object.entries(moduleCounts).filter(([key]) =>
      currentModuleKeys.some((moduleKey) => moduleKey === key),
    ),
  )
  const moduleTotal = Object.values(activeModuleCounts).reduce((total, value) => total + value, 0)
  // 与提交给后端的 count 保持一致；自定义模块按实际勾选的张数算，没选就是 0
  const expectedCount =
    mode === 'general'
      ? count
      : task === 'product-main' || task === 'detail-page'
        ? moduleMode === 'custom'
          ? moduleTotal
          : 1
        : 1

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
        ? { moduleMode, moduleCounts: { ...activeModuleCounts } }
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

  const requirementsPlaceholder =
    task === 'product-main'
      ? '建议输入：产品名称，核心卖点，目标人群，主图风格，平台规范等'
      : task === 'detail-page'
        ? '选填，例如：想在详情页强调的卖点、目标人群、使用场景、需要展示的细节等'
        : '选填，例如：去除背景杂物、增强产品光泽、修复划痕、提升整体清晰度等'

  // 重新生成前的二次确认内容：只摊开真实会用到的配置
  const configRows: ReadonlyArray<RegenerateRow> =
    mode === 'general'
      ? [
          { label: '画面描述', value: prompt.trim() || '（未填写）', multiline: true },
          { label: '创作风格', value: optionLabel(styleOptions, style) },
          {
            label: '参考图',
            value: referenceFiles.length > 0 ? `${referenceFiles.length} 张` : '无',
          },
          {
            label: '模型 / 比例 / 清晰度',
            value: `${optionLabel(modelOptions, model)} · ${aspectRatio} · ${resolution}`,
          },
        ]
      : [
          { label: '任务类型', value: currentTask.title },
          { label: '商品素材', value: `${productFiles.length} 张` },
          ...(task === 'viral-recreate'
            ? [{ label: '参考爆款图', value: `${referenceFiles.length} 张` }]
            : []),
          ...(requirements.trim()
            ? [
                {
                  label:
                    task === 'product-main'
                      ? '主图需求'
                      : task === 'detail-page'
                        ? '详情图需求'
                        : '补充要求',
                  value: requirements.trim(),
                  multiline: true,
                },
              ]
            : []),
          { label: '目标平台', value: optionLabel(platformOptions, platform) },
          {
            label: '模型 / 比例 / 清晰度',
            value: `${optionLabel(modelOptions, model)} · ${aspectRatio} · ${resolution}`,
          },
        ]

  async function changeMode(nextMode: WorkbenchMode) {
    configurationRequestRef.current += 1
    try {
      await draft.flush()
    } catch {
      setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再切换工具' })
      return
    }
    if (!mounted.current) return
    setLoadingConfigId(null)
    const targetLayout = nextMode === 'general' ? generalLayout : commerceLayout
    targetLayout.setCollapsed(false)
    setPanelOpen(false)
    setNotice(null)
    router.replace(studioToolUrl(nextMode, task, searchParams))
  }

  async function changeTask(nextTask: CommerceTaskType) {
    configurationRequestRef.current += 1
    try {
      await draft.flush()
    } catch {
      setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再切换工具' })
      return
    }
    if (!mounted.current) return
    setLoadingConfigId(null)
    commerceLayout.setCollapsed(false)
    setPanelOpen(false)
    setNotice(null)
    router.replace(studioToolUrl('commerce', nextTask, searchParams))
  }

  /** 把一张结果图取回成可以直接放进素材区的文件 */
  async function fetchImageFile(path: string, _name: string) {
    return loadStoredImage(path)
  }
  /** 历史任务里存的是 assetId，需要按 id 取回内容才能还原成可编辑的素材 */
  async function fetchAssetFiles(assetIds: string[]) {
    if (assetIds.length === 0) return []
    return Promise.all(
      assetIds.map((assetId, index) =>
        fetchImageFile(`/v1/assets/${assetId}/content`, `history-${index + 1}`),
      ),
    )
  }

  /**
   * 把结果图作为参考图继续迭代：
   * 与当前工具同类型时直接填入素材区；不同类型时先切到对应的生图配置页再填入。
   */
  async function useImageAsReference(
    path: string,
    source: { mode: WorkbenchMode; taskType: CommerceTaskType },
  ) {
    if (source.mode !== mode || (source.mode === 'commerce' && source.taskType !== task)) {
      try {
        await draft.flush()
      } catch {
        setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再切换工具' })
        return
      }
      if (!mounted.current) return
      const target = referenceWorkbenchUrl(path, source.mode, source.taskType, searchParams)
      if (target) router.replace(target)
      return
    }
    const requestId = configurationRequestRef.current
    const slot = mode === 'general' || task === 'viral-recreate' ? 'referenceFiles' : 'productFiles'
    const limit = mode === 'commerce' && task === 'viral-recreate' ? 1 : referenceLimit(mode, task)
    setConfigCollapsed(false)
    setPanelOpen(true)
    setNotice(null)
    try {
      const file = await fetchImageFile(path, 'ref-result')
      if (!mounted.current || requestId !== configurationRequestRef.current) return
      const addition = addCreationImage(currentImages.current[slot], file, limit)
      if (addition.status === 'full') {
        setNotice({ kind: 'error', message: `素材已达到 ${limit} 张上限，请先移除一张再继续创作` })
        return
      }
      if (addition.status === 'added') {
        currentImages.current = { ...currentImages.current, [slot]: addition.images }
        if (slot === 'referenceFiles') setReferenceFiles(addition.images)
        else setProductFiles(addition.images)
      }
      draft.markEntryApplied()
      setNotice({
        kind: 'success',
        message:
          addition.status === 'existing'
            ? '这张图片已在素材区，无需重复添加'
            : '已作为参考图填入创作素材区',
      })
      document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (!mounted.current || requestId !== configurationRequestRef.current) return
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '图片读取失败，请稍后重试',
      })
    }
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
    const requestId = ++configurationRequestRef.current
    const input = historyTaskToLoad.input
    setLoadingConfigId(historyTaskToLoad.id)
    setNotice(null)
    try {
      const [nextProductFiles, nextReferenceFiles] = await Promise.all([
        fetchAssetFiles(input.productAssetIds ?? []),
        fetchAssetFiles(input.referenceAssetIds ?? []),
      ])
      if (requestId !== configurationRequestRef.current) return false
      const nextMode: WorkbenchMode = input.mode === 'commerce' ? 'commerce' : 'general'
      const nextTask: CommerceTaskType = (
        ['product-main', 'detail-page', 'viral-recreate', 'product-retouch'] as CommerceTaskType[]
      ).includes(input.taskType as CommerceTaskType)
        ? (input.taskType as CommerceTaskType)
        : 'product-main'

      setMode(nextMode)
      setTask(nextTask)
      const targetLayout = nextMode === 'general' ? generalLayout : commerceLayout
      targetLayout.setCollapsed(false)
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
      if (requestId === configurationRequestRef.current)
        setNotice({
          kind: 'error',
          message: error instanceof Error ? error.message : '载入配置失败',
        })
      return false
    } finally {
      if (requestId === configurationRequestRef.current) setLoadingConfigId(null)
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
    if (recipe) {
      reviewRecipeCost()
      return
    }
    if (shouldSkipRegenerateConfirm()) {
      setAutoRegeneratePending(true)
      return
    }
    // 与上一批 state 更新同一批提交，弹窗里展示的就是刚载入的配置
    setConfirmOpen(true)
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

  /** 重新生成前先确认：每次生成都会调用 AI 服务并产生费用 */
  function requestRegenerate() {
    if (recipe) {
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

  function buildPayload(productAssetIds: string[], referenceAssetIds: string[]): unknown {
    const commerceCount =
      task === 'product-main' || task === 'detail-page'
        ? moduleMode === 'custom'
          ? Math.max(1, moduleTotal)
          : 1
        : 1
    const imageSettings = {
      projectId: searchParams.get('projectId') || undefined,
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
        moduleCounts: activeModuleCounts,
        ...(recipe && moduleMode === 'custom'
          ? { moduleOrder: Object.keys(activeModuleCounts) }
          : {}),
      }
    if (task === 'viral-recreate')
      return { ...common, referenceAssetIds, recreateStrength, requirements, outputLanguage }
    return { ...common, enhancements, requirements }
  }

  function reviewRecipeCost() {
    setConfigCollapsed(false)
    setPanelOpen(true)
    setNotice({ kind: 'success', message: '请核对当前商品图与积分，再确认生成。' })
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.generate-button')?.focus())
  }

  function createGenerationTask(confirmedQuote?: GenerationQuote) {
    if (isSubmitting || isGenerating) return
    if (!draft.ready || templateBlockedReason) {
      setNotice({ kind: 'error', message: templateBlockedReason || '正在恢复草稿，请稍候' })
      return
    }
    const token = getAccessToken()
    if (!token) {
      void login()
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
      recipe &&
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
    if (mode === 'commerce' && task === 'viral-recreate' && referenceFiles.length !== 1) {
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
      onAuthRequired: () => void login(),
      onSubmitted: () => {
        if (recipe && window.matchMedia('(max-width: 780px)').matches) {
          document.querySelector('.result-workspace')?.scrollIntoView({ block: 'start' })
        }
      },
    })
  }

  async function login() {
    const currentUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
    try {
      await draft.flush()
      await prepareGuestDraftLogin(currentUrl)
      if (mounted.current) router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
    } catch {
      if (mounted.current) setNotice({ kind: 'error', message: '草稿尚未保存，请重试保存后再登录' })
    }
  }

  async function clearDraft() {
    configurationRequestRef.current++
    setLoadingConfigId(null)
    setCollectionUndo(null)
    setAutoRegeneratePending(false)
    setConfirmOpen(false)
    inspiration.dismiss()
    await draft.clear()
    if (mounted.current) router.replace(currentToolUrl, { scroll: false })
  }

  if (!draft.ready) return <WorkbenchSkeleton mode={mode} />

  return (
    <main className="workbench-page">
      <section
        data-commerce-recipe={recipe?.id}
        className={`workbench-shell floating-workbench mode-${mode} config-${creatorLayout.side} ${panelOpen ? 'panel-open' : ''} ${configCollapsed ? 'creator-config-collapsed' : ''}`}
      >
        <WorkbenchRail
          mode={mode}
          projectId={searchParams.get('projectId')}
          onChangeMode={changeMode}
          task={mode === 'commerce' ? task : undefined}
          onChangeTask={changeTask}
        />
        <WorkbenchHeader
          projectId={searchParams.get('projectId')}
          collectionTools={
            <>
              <CreationDraftStatus
                status={draft.status}
                error={draft.error}
                onRetry={draft.retry}
                onClear={clearDraft}
                disabled={isGenerating || isSubmitting}
              />
              <CreationLibraryTools
                config={currentPreset()}
                prompt={mode === 'general' ? prompt : requirements}
                disabled={isGenerating || isSubmitting}
                onApply={(application) => applyCollection(application)}
                onUndo={
                  collectionUndo
                    ? () => {
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
                    : undefined
                }
              />
            </>
          }
          mode={mode}
          task={task}
          panelOpen={!configCollapsed}
          jumpToSettings={mode === 'commerce' && !creatorLayout.desktop}
          historyOpen={historyOpen}
          onShowDetails={() => setDetailsOpen(true)}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onTogglePanel={() => setConfigCollapsed((collapsed) => !collapsed)}
        />
        <CreatorSidebar
          recipeTitle={recipe?.title}
          templateBlockedReason={templateBlockedReason}
          referenceRequired={inspirationTemplate?.requiresReference}
          draftStatus={draft.status}
          draftError={draft.error}
          onRetryDraft={draft.retry}
          templateNotice={
            mode === 'general' ? (
              <>
                <InspirationHandoffStatus handoff={inspiration} />
                {inspirationTemplate && (
                  <InspirationTemplateNotice
                    template={inspirationTemplate}
                    referenceCount={referenceFiles.length}
                    onDismiss={() => setInspirationTemplate(null)}
                  />
                )}
              </>
            ) : undefined
          }
          mode={mode}
          configCollapsed={configCollapsed}
          onToggleConfig={() => setConfigCollapsed((collapsed) => !collapsed)}
          configSide={creatorLayout.side}
          onSetConfigSide={creatorLayout.setSide}
          onResetLayout={creatorLayout.reset}
          task={task}
          title={title}
          requirementsPlaceholder={requirementsPlaceholder}
          productFiles={productFiles}
          referenceFiles={referenceFiles}
          prompt={prompt}
          requirements={requirements}
          platform={platform}
          outputLanguage={outputLanguage}
          style={style}
          referenceStrength={referenceStrength}
          moduleMode={moduleMode}
          moduleCounts={activeModuleCounts}
          recreateStrength={recreateStrength}
          enhancements={enhancements}
          count={count}
          model={model}
          aspectRatio={aspectRatio}
          resolution={resolution}
          expectedCount={expectedCount}
          aiEnabled={aiEnabled}
          promptEnhanceEnabled={promptEnhanceEnabled}
          promptVision={promptVision}
          imageEndpoints={imageEndpoints}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          onReloadModels={() => setModelsRevision((value) => value + 1)}
          endpointId={endpointId}
          onSetEndpoint={(id) => {
            setEndpointId(id)
            const selected = imageEndpoints.find((endpoint) => endpoint.id === id)
            if (selected) setModel(selected.model)
          }}
          notice={notice}
          isSubmitting={isSubmitting}
          isGenerating={isGenerating}
          generationStatus={generationTask?.status ?? null}
          onSetProductFiles={(files) => {
            currentImages.current = { ...currentImages.current, productFiles: files }
            setProductFiles(files)
          }}
          onSetReferenceFiles={(files) => {
            currentImages.current = { ...currentImages.current, referenceFiles: files }
            setReferenceFiles(files)
          }}
          onSetPrompt={setPrompt}
          onSetRequirements={setRequirements}
          onSetPlatform={setPlatform}
          onSetOutputLanguage={setOutputLanguage}
          onSetStyle={setStyle}
          onSetReferenceStrength={setReferenceStrength}
          onSetModuleMode={setModuleMode}
          onSetModuleCounts={(nextCounts) =>
            setModuleCounts((prev) => {
              // nextCounts 只含当前任务的模块：保留另一任务已选的模块，再覆盖当前任务的部分
              const otherTasks = Object.fromEntries(
                Object.entries(prev).filter(
                  ([key]) => !currentModuleKeys.some((moduleKey) => moduleKey === key),
                ),
              )
              return { ...otherTasks, ...nextCounts }
            })
          }
          onSetRecreateStrength={setRecreateStrength}
          onSetEnhancements={setEnhancements}
          onSetCount={setCount}
          onSetModel={setModel}
          onSetAspectRatio={setAspectRatio}
          onSetResolution={setResolution}
          onCloseSheet={() => setPanelOpen(false)}
          onSubmit={() => createGenerationTask()}
          onConfirmCost={recipe ? createGenerationTask : undefined}
        />
        <ResultWorkspace
          starter={
            <CreationStarter
              mode={mode}
              task={task}
              recipePreview={
                recipe ? { title: recipe.title, hasProduct: hasProductImage } : undefined
              }
              canApply={!(mode === 'general' ? prompt : requirements).trim()}
              disabled={isGenerating || isSubmitting}
              onApply={(example) => {
                if (
                  isGenerating ||
                  isSubmitting ||
                  (mode === 'general' ? prompt : requirements).trim()
                )
                  return
                if (mode === 'general') setPrompt(example.prompt)
                else setRequirements(example.prompt)
                setConfigCollapsed(false)
                setPanelOpen(true)
                setNotice({
                  kind: 'success',
                  message: `已填入“${example.title}”，可编辑后确认参数与积分`,
                })
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLTextAreaElement>(
                      '.configuration-panel textarea.prompt-input',
                    )
                    ?.focus(),
                )
              }}
            />
          }
          mode={mode}
          task={task}
          aspectRatio={aspectRatio}
          resolution={resolution}
          expectedCount={expectedCount}
          generatingCount={submittedCount}
          resultHistory={resultHistory}
          activeResultIndex={activeResultIndex}
          activeResult={activeResult}
          generationTask={generationTask}
          isGenerating={isGenerating}
          isSubmitting={isSubmitting}
          historyOpen={historyOpen}
          historyTask={historyTask}
          loadingHistoryConfigId={loadingConfigId}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onSelectHistory={(nextTask) => {
            setHistoryTask(nextTask)
            setHistoryOpen(false)
          }}
          onExitHistoryView={() => setHistoryTask(null)}
          onLoadHistoryConfig={(record) => void loadHistoryConfig(record)}
          onRegenerateFromHistory={(record) => void regenerateFromHistory(record)}
          onDeleteHistoryTask={deleteHistoryTask}
          onUseImageAsReference={(path, source) => void useImageAsReference(path, source)}
          isRegeneratingHistory={loadingConfigId !== null}
          onSetActiveResultIndex={setActiveResultIndex}
          onRegenerate={requestRegenerate}
        />
      </section>

      {detailsOpen && (
        <InfoDialog
          title="当前创作参数"
          subtitle="提交生成时将使用这些设置"
          onClose={() => setDetailsOpen(false)}
        >
          <dl className="studio-parameter-details">
            {configRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
            <div>
              <dt>预计出图</dt>
              <dd>{expectedCount} 张</dd>
            </div>
          </dl>
        </InfoDialog>
      )}
      {confirmOpen && (
        <RegenerateDialog
          title={title}
          rows={configRows}
          expectedCount={expectedCount}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false)
            createGenerationTask()
          }}
        />
      )}
    </main>
  )
}
