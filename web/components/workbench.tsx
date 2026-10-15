'use client'

import type { CreationImage } from '@/lib/creation-images'
import { loadStoredImage } from '@/lib/library'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { apiBaseUrl, deleteGenerationTask, getAccessToken } from '@/lib/api'

import { InfoDialog } from './info-dialog'
import { CreatorSidebar } from './workbench/creator-sidebar'
import { ClothingWorkbench } from './workbench/clothing-workbench'
import {
  RegenerateDialog,
  shouldSkipRegenerateConfirm,
  type RegenerateRow,
} from './workbench/regenerate-dialog'
import { ResultWorkspace } from './workbench/result-workspace'
import { WorkbenchHeader } from './workbench/workbench-header'
import { WorkbenchRail } from './workbench/workbench-rail'
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
  type ConfigSide,
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
  return props.initialMode === 'commerce' && props.initialTask === 'clothing-set' ? (
    <ClothingWorkbench
      initialModel={props.initialModel}
      initialAspectRatio={props.initialAspectRatio}
      initialResolution={props.initialResolution}
    />
  ) : (
    <StandardWorkbench {...props} />
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
}: WorkbenchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)
  const [configSide, setConfigSide] = useState<ConfigSide>(() => {
    if (typeof document === 'undefined') return 'left'
    return (
      document.documentElement.getAttribute('data-wb-side') === 'right' ? 'right' : 'left'
    ) as ConfigSide
  })
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [requirements, setRequirements] = useState('')
  const [productFiles, setProductFiles] = useState<CreationImage[]>([])
  const [referenceFiles, setReferenceFiles] = useState<CreationImage[]>([])
  const [count, setCount] = useState(() =>
    Math.min(generalMaxCount, Math.max(1, Number(initialCount) || 1)),
  )
  const [model, setModel] = useState<GenerationModel>(
    (initialModel as GenerationModel) ?? 'gpt-image-2',
  )
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio ?? '1:1')
  const [resolution, setResolution] = useState(initialResolution ?? '2K')
  const [style, setStyle] = useState<GeneralStyle>('unspecified')
  const [referenceStrength, setReferenceStrength] = useState<ReferenceStrength>('medium')
  const [platform, setPlatform] = useState('smart')
  const [outputLanguage, setOutputLanguage] = useState('none')
  const [moduleMode, setModuleMode] = useState<ModuleMode>('smart')
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({})
  const [recreateStrength, setRecreateStrength] = useState<'style' | 'high'>('style')
  const [enhancements, setEnhancements] = useState<string[]>([])
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [promptEnhanceEnabled, setPromptEnhanceEnabled] = useState(false)
  const [promptVision, setPromptVision] = useState(false)
  const [imageEndpoints, setImageEndpoints] = useState<
    { id: string; name: string; model: string; isDefault: boolean }[]
  >([])
  const [endpointId, setEndpointId] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [generalConfigCollapsed, setGeneralConfigCollapsed] = useState(false)
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
  } = useGenerationTask(`${mode}:${task}`)

  useEffect(() => {
    if (mode === 'general' && generationTask) setGeneralConfigCollapsed(true)
  }, [mode, generationTask?.id])

  const hasProductImage = productFiles.length > 0
  useWorkbenchHandoff({
    ready: aiEnabled !== null,
    onHistory: (record, review) =>
      review ? regenerateFromHistory(record) : loadHistoryConfig(record),
    onReference: (path) => useImageAsReference(path, { mode, taskType: task }),
    onError: (message) => setNotice({ kind: 'error', message }),
  })
  useReversePromptHandoff({
    ready: aiEnabled !== null && mode === 'general',
    onApply: (text, file) => {
      if (file && referenceFiles.length >= referenceLimit('general', task))
        throw new Error('参考图已达上限，请先移除一张再应用反推结果')
      setPrompt((previous) =>
        applyReverseText(previous, text, previous.trim() ? 'append' : 'replace'),
      )
      if (file) setReferenceFiles((previous) => [...previous, file])
      setGeneralConfigCollapsed(false)
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
    if (mode === 'general' && notice?.kind === 'error') {
      setGeneralConfigCollapsed(false)
    }
  }, [mode, notice])

  useEffect(() => {
    const savedSide = window.localStorage.getItem('istudio-config-side')
    setConfigSide(savedSide === 'right' ? 'right' : 'left')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('istudio-config-side', configSide)
  }, [configSide])

  useEffect(() => {
    fetch(`${apiBaseUrl}/v1/generation/capabilities`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
      .then((response) => response.json())
      .then(
        (data: {
          aiEnabled?: boolean
          promptEnhanceEnabled?: boolean
          promptVision?: boolean
          imageEndpoints?: { id: string; name: string; model: string; isDefault: boolean }[]
        }) => {
          setAiEnabled(Boolean(data.aiEnabled))
          setPromptEnhanceEnabled(Boolean(data.promptEnhanceEnabled))
          setPromptVision(Boolean(data.promptVision))
          const endpoints = data.imageEndpoints ?? []
          setImageEndpoints(endpoints)
          const selected =
            endpoints.find((endpoint) => endpoint.model === initialModel) ??
            endpoints.find((endpoint) => endpoint.isDefault) ??
            endpoints[0]
          if (selected) {
            setEndpointId(selected.id)
            setModel(selected.model)
          }
        },
      )
      .catch(() => setAiEnabled(false))
  }, [])

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
    setGeneralConfigCollapsed(false)
    setNotice({
      kind: 'success',
      message: restore ? '已撤销应用' : `已应用“${application.title}”，可继续编辑或撤销`,
    })
  }
  usePersonalPromptHandoff({
    ready: aiEnabled !== null && !isGenerating && !isSubmitting,
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

  function changeMode(nextMode: WorkbenchMode) {
    configurationRequestRef.current += 1
    setLoadingConfigId(null)
    setMode(nextMode)
    setGeneralConfigCollapsed(false)
    setPanelOpen(false)
    setNotice(null)
    router.replace(
      nextMode === 'general' ? '/workbench?mode=general' : `/workbench?mode=commerce&task=${task}`,
    )
  }

  function changeTask(nextTask: CommerceTaskType) {
    configurationRequestRef.current += 1
    setLoadingConfigId(null)
    setTask(nextTask)
    setMode('commerce')
    setGeneralConfigCollapsed(false)
    setPanelOpen(false)
    setNotice(null)
    router.replace(`/workbench?mode=commerce&task=${nextTask}`)
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
    if (source.mode === 'commerce' && source.taskType === 'clothing-set') {
      const target = referenceWorkbenchUrl(path, 'commerce', 'clothing-set')
      if (target) router.replace(target)
      return
    }
    const targetMode = source.mode === 'commerce' ? 'commerce' : 'general'
    const targetTask = (
      ['product-main', 'detail-page', 'viral-recreate', 'product-retouch'] as CommerceTaskType[]
    ).includes(source.taskType)
      ? source.taskType
      : 'product-main'
    if (targetMode === 'general') setGeneralConfigCollapsed(false)
    setNotice(null)
    try {
      const file = await fetchImageFile(path, 'ref-result')
      const slot: 'product' | 'reference' =
        targetMode === 'general' || targetTask === 'viral-recreate' ? 'reference' : 'product'
      const single = targetTask === 'viral-recreate' || targetTask === 'product-retouch'
      if (slot === 'reference') {
        setReferenceFiles((previous) => (single ? [file] : [...previous, file].slice(0, 6)))
      } else {
        setProductFiles((previous) => (single ? [file] : [...previous, file].slice(0, 6)))
      }

      const sameScope = targetMode === mode && (targetMode === 'general' || targetTask === task)
      if (!sameScope) {
        setMode(targetMode)
        setTask(targetTask)
        setHistoryTask(null)
        setHistoryOpen(false)
        router.replace(
          targetMode === 'general'
            ? '/workbench?mode=general'
            : `/workbench?mode=commerce&task=${targetTask}`,
        )
      }
      const message = sameScope
        ? '已作为参考图填入创作素材区'
        : `已切到${targetMode === 'general' ? '通用生图' : taskMeta[targetTask].title}，图片已填入素材区`
      if (sameScope) setNotice({ kind: 'success', message })
      else pendingNoticeRef.current = { kind: 'success', message }
      // 参考图已填入左侧，滚动到素材区让用户确认
      document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : '图片读取失败，请稍后重试',
      })
    }
  }

  /** 载入一条历史记录的配置，继续在当前工作台里编辑 */
  async function loadHistoryConfig(historyTaskToLoad: HistoryTask) {
    if (historyTaskToLoad.input.taskType === 'clothing-set') {
      router.replace(historyWorkbenchUrl(historyTaskToLoad))
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
      if (nextMode === 'general') setGeneralConfigCollapsed(false)
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
      setHistoryTask(null)
      setHistoryOpen(false)
      router.replace(
        nextMode === 'general'
          ? '/workbench?mode=general'
          : `/workbench?mode=commerce&task=${nextTask}`,
      )
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
    if (historyTaskToLoad.input.taskType === 'clothing-set') {
      router.replace(historyWorkbenchUrl(historyTaskToLoad, true))
      return
    }
    const loaded = await loadHistoryConfig(historyTaskToLoad)
    if (!loaded) return
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
    if (mode === 'general') setGeneralConfigCollapsed(false)
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
      }
    if (task === 'viral-recreate')
      return { ...common, referenceAssetIds, recreateStrength, requirements, outputLanguage }
    return { ...common, enhancements, requirements }
  }

  function createGenerationTask() {
    if (isSubmitting || isGenerating) return
    const token = getAccessToken()
    if (!token) {
      const currentUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
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
      buildPayload,
      onSubmitted: () => {
        if (mode === 'general') {
          setGeneralConfigCollapsed(true)
        }
      },
      onAuthRequired: () => {
        const currentUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
        router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
      },
    })
  }

  return (
    <main className="workbench-page">
      <section
        className={`workbench-shell mode-${mode} config-${configSide} ${panelOpen ? 'panel-open' : ''} ${mode === 'general' && generalConfigCollapsed ? 'general-config-collapsed' : ''}`}
      >
        <WorkbenchRail
          mode={mode}
          onChangeMode={changeMode}
          task={mode === 'commerce' ? task : undefined}
          onChangeTask={changeTask}
        />
        <WorkbenchHeader
          collectionTools={
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
          }
          mode={mode}
          task={task}
          configSide={configSide}
          panelOpen={panelOpen}
          historyOpen={historyOpen}
          onShowDetails={() => setDetailsOpen(true)}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onChangeSide={setConfigSide}
          onTogglePanel={() => {
            setPanelOpen((open) => !open)
            document
              .querySelector('.configuration-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
        <CreatorSidebar
          mode={mode}
          generalConfigCollapsed={generalConfigCollapsed}
          onToggleGeneralConfig={() => setGeneralConfigCollapsed((collapsed) => !collapsed)}
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
          onSetProductFiles={setProductFiles}
          onSetReferenceFiles={setReferenceFiles}
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
          onSubmit={createGenerationTask}
        />
        <ResultWorkspace
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
            if (mode === 'general') setGeneralConfigCollapsed(true)
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
