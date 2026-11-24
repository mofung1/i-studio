'use client'

import type { CreationImage } from '@/lib/creation-images'
import { commerceRecipeUrl, getCommerceRecipe, type CommerceRecipe } from '@/lib/commerce-recipe'
import { creditHelpHref } from '@/lib/credit-navigation'
import { studioToolUrl } from '@/lib/studio-navigation'
import { creationDraftContext, prepareGuestDraftLogin } from '@/lib/creation-drafts'
import type { InspirationTemplate } from '@/lib/inspiration-handoff'
import { CreationDraftStatus } from './workbench/creation-draft-status'
import { WorkbenchSkeleton } from './workbench/workbench-skeleton'
import { useStandardDraft } from './workbench/use-standard-draft'
import {
  InspirationHandoffStatus,
  InspirationTemplateNotice,
} from './workbench/inspiration-template-notice'
import { AccountAccess } from './account-access'
import { modelCompatibilityIssue } from '@/lib/generation-models'

import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { InfoDialog } from './info-dialog'
import { useAccount } from './account-provider'
import { CreatorSidebar } from './workbench/creator-sidebar'
import { ClothingWorkbench } from './workbench/clothing-workbench'
import { RegenerateDialog, type RegenerateRow } from './workbench/regenerate-dialog'
import { ResultWorkspace } from './workbench/result-workspace'
import { CreationStarter } from './workbench/creation-starter'
import { WorkbenchHeader } from './workbench/workbench-header'
import { WorkbenchRail } from './workbench/workbench-rail'
import { useCreatorPreferences } from './workbench/use-creator-preferences'
import { useGenerationTask } from './workbench/use-generation-task'
import { useGenerationFlow } from './workbench/use-generation-flow'
import { useModelCatalog } from './workbench/use-model-catalog'
import { useWorkbenchHandoff } from './workbench/use-workbench-handoff'
import { useHistoryConfig } from './workbench/use-history-config'
import { useImageAsReference } from './workbench/use-image-as-reference'
import { useReversePromptHandoff } from './workbench/use-reverse-prompt-handoff'
import { applyReverseText } from '@/lib/prompt-reverse'
import { CreationLibraryTools } from './workbench/creation-library-tools'
import { usePersonalApplication } from './workbench/use-personal-application'
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

const reducedMotionPreference = '(prefers-reduced-motion: reduce)'

export function Workbench(props: WorkbenchProps) {
  const { account, loading, error } = useAccount()
  const search = useSearchParams()
  const tool = props.initialMode === 'general' ? 'general' : `commerce:${props.initialTask}`
  // The visible tool is tracked above the existing, independently restored draft scopes.
  const visibleTool = useRef<string | null>(null)
  const settingsEntrance = useRef<Animation | null>(null)
  const settingsRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || visibleTool.current === tool) return
      visibleTool.current = tool
      settingsEntrance.current?.cancel()
      settingsEntrance.current = null
      if (node.hidden || !node.animate || window.matchMedia(reducedMotionPreference).matches) return

      const style = getComputedStyle(node)
      const time = style.getPropertyValue('--motion-content').trim()
      const duration = Number.parseFloat(time) * (time.endsWith('ms') ? 1 : 1000)
      if (!Number.isFinite(duration)) return

      const animation = node.animate([{ opacity: 0.82 }, { opacity: 1 }], {
        duration,
        easing: style.getPropertyValue('--motion-ease-out').trim(),
      })
      animation.id = 'workbench-settings-entrance'
      settingsEntrance.current = animation
      animation.onfinish = () => {
        if (settingsEntrance.current === animation) settingsEntrance.current = null
      }
    },
    [tool],
  )
  useEffect(() => {
    const preference = window.matchMedia(reducedMotionPreference)
    const cancelEntrance = () => {
      settingsEntrance.current?.cancel()
      settingsEntrance.current = null
    }
    preference.addEventListener('change', cancelEntrance)
    return () => {
      preference.removeEventListener('change', cancelEntrance)
      cancelEntrance()
      visibleTool.current = null
    }
  }, [])

  if (loading) return <WorkbenchSkeleton mode={props.initialMode} />
  if (error && !account.authenticated)
    return <AccountAccess title="恢复创作草稿" description="确认账号后即可恢复草稿。" />
  const owner = account.user?.id ?? 'guest'
  const selectedRecipe = getCommerceRecipe(search.get('recipe'))
  const recipe =
    props.initialMode === 'commerce' && selectedRecipe?.task === props.initialTask
      ? selectedRecipe
      : undefined
  const key = `${owner}:${creationDraftContext(tool, search.get('projectId') ?? '', recipe?.id)}`
  return props.initialMode === 'commerce' && props.initialTask === 'clothing-set' ? (
    <ClothingWorkbench
      key={key}
      settingsRef={settingsRef}
      recipe={recipe?.task === 'clothing-set' ? recipe : undefined}
      initialModel={props.initialModel}
      initialAspectRatio={props.initialAspectRatio}
      initialResolution={props.initialResolution}
    />
  ) : (
    <StandardWorkbench key={key} {...props} recipe={recipe} settingsRef={settingsRef} />
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
  settingsRef,
}: WorkbenchProps & { recipe?: CommerceRecipe; settingsRef: Ref<HTMLDivElement> }) {
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
  const [endpointId, setEndpointId] = useState('')
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
    submitImageRedo,
    removeResult,
  } = useGenerationTask(
    recipe
      ? `${mode}:${task}:${recipe.id}:${searchParams.get('projectId') ?? ''}`
      : `${mode}:${task}`,
    { restoreLatest: !recipe },
  )

  const { draft, inspiration, restoreHandoff, templateBlockedReason } = useStandardDraft({
    owner: account.user?.id ?? 'guest',
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
  })
  const {
    imageEndpoints,
    aiEnabled,
    promptEnhanceEnabled,
    promptVision,
    modelsLoading,
    modelsError,
    reloadModels,
    selectEndpoint,
  } = useModelCatalog({
    initialModel,
    ready: draft.ready,
    restorationFailed: draft.restorationFailed,
    endpointId,
    setEndpointId,
    setModel,
  })

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
    onReference: (path) => insertResultAsReference(path, { mode, taskType: task }),
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

  const { collectionUndo, currentPreset, applyCollection, undoCollection, clearCollectionUndo } =
    usePersonalApplication({
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
      moduleCounts: activeModuleCounts,
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

  const {
    submittedCount,
    confirmOpen,
    openConfirm,
    requestAutoRegenerate,
    cancelConfirm,
    confirmGeneration,
    requestRegenerate,
    createGenerationTask,
    reviewRecipeCost,
    resetFlow,
    detailsOpen,
    openDetails,
    closeDetails,
  } = useGenerationFlow({
    mode,
    task,
    hasRecipe: Boolean(recipe),
    expectedCount,
    projectId: searchParams.get('projectId') || undefined,
    draftReady: draft.ready,
    templateBlockedReason,
    isSubmitting,
    isGenerating,
    hasProductImage,
    aiEnabled,
    compatibilityIssue,
    referenceFileCount: referenceFiles.length,
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
    moduleCounts: activeModuleCounts,
    recreateStrength,
    enhancements,
    submit,
    onLogin: () => void login(),
    setNotice,
    setHistoryTask,
    setHistoryOpen,
    setConfigCollapsed,
    setPanelOpen,
  })

  const revealConfig = (nextMode: WorkbenchMode) => {
    const targetLayout = nextMode === 'general' ? generalLayout : commerceLayout
    targetLayout.setCollapsed(false)
  }
  const insertResultAsReference = useImageAsReference({
    mode,
    task,
    draft,
    mounted,
    requestRef: configurationRequestRef,
    currentImages,
    setProductFiles,
    setReferenceFiles,
    setConfigCollapsed,
    setPanelOpen,
    setNotice,
  })
  const {
    loadingConfigId,
    setLoadingConfigId,
    loadHistoryConfig,
    regenerateFromHistory,
    deleteHistoryTask,
  } = useHistoryConfig({
    mode,
    task,
    hasRecipe: Boolean(recipe),
    currentToolUrl,
    draft,
    mounted,
    requestRef: configurationRequestRef,
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
  })

  async function navigateTool(nextMode: WorkbenchMode, target: string) {
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
    router.replace(target)
  }

  function changeMode(nextMode: WorkbenchMode) {
    return navigateTool(nextMode, studioToolUrl(nextMode, task, searchParams))
  }

  function changeTask(nextTask: CommerceTaskType) {
    return navigateTool('commerce', studioToolUrl('commerce', nextTask, searchParams))
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
    clearCollectionUndo()
    resetFlow()
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
                onApply={applyCollection}
                onUndo={collectionUndo ? undoCollection : undefined}
              />
            </>
          }
          mode={mode}
          task={task}
          panelOpen={!configCollapsed}
          jumpToSettings={mode === 'commerce' && !creatorLayout.desktop}
          historyOpen={historyOpen}
          onShowDetails={openDetails}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onTogglePanel={() => setConfigCollapsed((collapsed) => !collapsed)}
        />
        <CreatorSidebar
          settingsRef={settingsRef}
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
          onReloadModels={reloadModels}
          endpointId={endpointId}
          onSetEndpoint={selectEndpoint}
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
          creditHelp={
            mode === 'general' || recipe
              ? { href: creditHelpHref(pathname, searchParams), saveDraft: draft.flush }
              : undefined
          }
        />
        <ResultWorkspace
          starter={
            <CreationStarter
              mode={mode}
              task={task}
              projectId={searchParams.get('projectId')}
              recipePreview={recipe}
              canApply={!(mode === 'general' ? prompt : requirements).trim()}
              disabled={isGenerating || isSubmitting}
              onOpenRecipe={(href) => void navigateTool('commerce', href)}
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
          onUseImageAsReference={(path, source) => void insertResultAsReference(path, source)}
          isRegeneratingHistory={loadingConfigId !== null}
          onSetActiveResultIndex={setActiveResultIndex}
          onRegenerate={requestRegenerate}
          onRedoImage={submitImageRedo}
          isRecipe={Boolean(recipe)}
        />
      </section>

      {detailsOpen && (
        <InfoDialog title="当前创作参数" subtitle="提交生成时将使用这些设置" onClose={closeDetails}>
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
          modelId={endpointId}
          rows={configRows}
          expectedCount={expectedCount}
          disabled={
            isSubmitting ||
            isGenerating ||
            aiEnabled !== true ||
            !draft.ready ||
            Boolean(templateBlockedReason || compatibilityIssue)
          }
          onCancel={cancelConfirm}
          onConfirm={confirmGeneration}
        />
      )}
    </main>
  )
}
