'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { InspirationGallery } from './inspiration-gallery'
import { CreatorSidebar } from './workbench/creator-sidebar'
import { RegenerateDialog, shouldSkipRegenerateConfirm, type RegenerateRow } from './workbench/regenerate-dialog'
import { ResultWorkspace } from './workbench/result-workspace'
import { WorkbenchHeader } from './workbench/workbench-header'
import { WorkbenchRail } from './workbench/workbench-rail'
import { useGenerationTask, type GenerationNotice } from './workbench/use-generation-task'
import type { HistoryTask } from './workbench/use-task-history'
import {
  detailModules,
  modelOptions,
  optionLabel,
  platformOptions,
  productMainModules,
  styleOptions,
  taskMeta,
  type ConfigSide,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './workbench/shared'

export type WorkbenchView = 'create' | 'inspire'

interface WorkbenchProps {
  initialMode: WorkbenchMode
  initialTask: CommerceTaskType
  initialView: WorkbenchView
  initialPrompt?: string
  initialModel?: string
  initialAspectRatio?: string
  initialResolution?: string
  initialCount?: string
}

export function Workbench({ initialMode, initialView, initialPrompt, initialTask, initialModel, initialAspectRatio, initialResolution, initialCount }: WorkbenchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<WorkbenchMode>(initialMode)
  const [task, setTask] = useState<CommerceTaskType>(initialTask)
  const [view, setView] = useState<WorkbenchView>(initialView)
  const [configSide, setConfigSide] = useState<ConfigSide>('left')
  const [prompt, setPrompt] = useState(initialPrompt ?? '柔和晨光中的极简静物摄影，构图干净，材质细节清晰。')
  const [requirements, setRequirements] = useState('')
  const [productFiles, setProductFiles] = useState<File[]>([])
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [count, setCount] = useState(() => Math.min(16, Math.max(1, Number(initialCount) || 1)))
  const [model, setModel] = useState<GenerationModel>((initialModel as GenerationModel) ?? 'gpt-image-2')
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTask, setHistoryTask] = useState<HistoryTask | null>(null)
  const [loadingConfigId, setLoadingConfigId] = useState<string | null>(null)
  // 提交那一刻的产出张数：生成过程中再改参数，加载占位不会跟着变
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // 切换生图类型会重置结果作用域并顺带清空提示，这里把提示延后到切换完成后再显示
  const pendingNoticeRef = useRef<GenerationNotice | null>(null)

  const {
    generationTask, resultHistory, activeResultIndex, activeResult,
    isSubmitting, isGenerating, notice, setNotice,
    setActiveResultIndex, submit,
  } = useGenerationTask(`${mode}:${task}`)

  const hasProductImage = productFiles.length > 0

  useEffect(() => {
    const savedSide = window.localStorage.getItem('istudio-config-side')
    setConfigSide(savedSide === 'right' ? 'right' : 'left')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('istudio-config-side', configSide)
  }, [configSide])

  useEffect(() => {
    fetch(`${apiBaseUrl}/v1/generation/capabilities`)
      .then((response) => response.json())
      .then((data: { aiEnabled?: boolean; promptEnhanceEnabled?: boolean }) => {
        setAiEnabled(Boolean(data.aiEnabled))
        setPromptEnhanceEnabled(Boolean(data.promptEnhanceEnabled))
      })
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
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const moduleTotal = Object.values(moduleCounts).reduce((total, value) => total + value, 0)
  // 与提交给后端的 count 保持一致；自定义模块按实际勾选的张数算，没选就是 0
  const expectedCount = mode === 'general'
    ? count
    : task === 'product-main' || task === 'detail-page'
      ? moduleMode === 'custom' ? moduleTotal : 1
      : 1

  const requirementsPlaceholder = task === 'product-main'
    ? '建议输入：产品名称，核心卖点，目标人群，主图风格，平台规范等'
    : task === 'detail-page'
      ? '选填，例如：想在详情页强调的卖点、目标人群、使用场景、需要展示的细节等'
      : '选填，例如：去除背景杂物、增强产品光泽、修复划痕、提升整体清晰度等'

  // 重新生成前的二次确认内容：只摊开真实会用到的配置
  const configRows: ReadonlyArray<RegenerateRow> = mode === 'general'
    ? [
        { label: '画面描述', value: prompt.trim() || '（未填写）', multiline: true },
        { label: '创作风格', value: optionLabel(styleOptions, style) },
        { label: '参考图', value: referenceFiles.length > 0 ? `${referenceFiles.length} 张` : '无' },
        { label: '模型 / 比例 / 清晰度', value: `${optionLabel(modelOptions, model)} · ${aspectRatio} · ${resolution}` },
      ]
    : [
        { label: '任务类型', value: currentTask.title },
        { label: '商品素材', value: `${productFiles.length} 张` },
        ...(task === 'viral-recreate' ? [{ label: '参考爆款图', value: `${referenceFiles.length} 张` }] : []),
        ...(requirements.trim() ? [{ label: task === 'product-main' ? '主图需求' : task === 'detail-page' ? '详情图需求' : '补充要求', value: requirements.trim(), multiline: true }] : []),
        { label: '目标平台', value: optionLabel(platformOptions, platform) },
        { label: '模型 / 比例 / 清晰度', value: `${optionLabel(modelOptions, model)} · ${aspectRatio} · ${resolution}` },
      ]

  function changeMode(nextMode: WorkbenchMode) {
    setMode(nextMode)
    setView('create')
    setPanelOpen(false)
    setNotice(null)
    router.replace(nextMode === 'general' ? '/workbench?mode=general' : `/workbench?mode=commerce&task=${task}`)
  }

  function changeTask(nextTask: CommerceTaskType) {
    setTask(nextTask)
    setMode('commerce')
    setView('create')
    setPanelOpen(false)
    setNotice(null)
    router.replace(`/workbench?mode=commerce&task=${nextTask}`)
  }

  function changeView(nextView: WorkbenchView) {
    setView(nextView)
    setPanelOpen(false)
    setNotice(null)
    setHistoryOpen(false)
    if (nextView === 'inspire') router.replace('/workbench?view=inspire')
  }

  /** 把一张结果图取回成可以直接放进素材区的文件 */
  async function fetchImageFile(path: string, name: string) {
    const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
    const token = getAccessToken()
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
    if (!response.ok) throw new Error('图片读取失败，请稍后重试')
    const blob = await response.blob()
    const type = blob.type || 'image/png'
    const extension = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png'
    return new File([blob], `${name}.${extension}`, { type })
  }

  /** 历史任务里存的是 assetId，需要按 id 取回内容才能还原成可编辑的素材 */
  async function fetchAssetFiles(assetIds: string[]) {
    if (assetIds.length === 0) return []
    return Promise.all(assetIds.map((assetId, index) => fetchImageFile(`/v1/assets/${assetId}/content`, `history-${index + 1}`)))
  }

  /**
   * 把结果图作为参考图继续迭代：
   * 与当前工具同类型时直接填入素材区；不同类型时先切到对应的生图配置页再填入。
   */
  async function useImageAsReference(path: string, source: { mode: WorkbenchMode; taskType: CommerceTaskType }) {
    const targetMode = source.mode === 'commerce' ? 'commerce' : 'general'
    const targetTask = (['product-main', 'detail-page', 'viral-recreate', 'product-retouch'] as CommerceTaskType[])
      .includes(source.taskType) ? source.taskType : 'product-main'
    setNotice(null)
    try {
      const file = await fetchImageFile(path, 'ref-result')
      const slot: 'product' | 'reference' = targetMode === 'general' || targetTask === 'viral-recreate' ? 'reference' : 'product'
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
        setView('create')
        setHistoryTask(null)
        setHistoryOpen(false)
        router.replace(targetMode === 'general' ? '/workbench?mode=general' : `/workbench?mode=commerce&task=${targetTask}`)
      }
      const message = sameScope
        ? '已作为参考图填入左侧素材区'
        : `已切到${targetMode === 'general' ? '通用生图' : taskMeta[targetTask].title}，图片已填入素材区`
      if (sameScope) setNotice({ kind: 'success', message })
      else pendingNoticeRef.current = { kind: 'success', message }
      // 参考图已填入左侧，滚动到素材区让用户确认
      document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : '图片读取失败，请稍后重试' })
    }
  }

  /** 载入一条历史记录的配置，继续在当前工作台里编辑 */
  async function loadHistoryConfig(historyTaskToLoad: HistoryTask) {
    const input = historyTaskToLoad.input
    setLoadingConfigId(historyTaskToLoad.id)
    setNotice(null)
    try {
      const [nextProductFiles, nextReferenceFiles] = await Promise.all([
        fetchAssetFiles(input.productAssetIds ?? []),
        fetchAssetFiles(input.referenceAssetIds ?? []),
      ])
      const nextMode: WorkbenchMode = input.mode === 'commerce' ? 'commerce' : 'general'
      const nextTask: CommerceTaskType = (['product-main', 'detail-page', 'viral-recreate', 'product-retouch'] as CommerceTaskType[])
        .includes(input.taskType as CommerceTaskType)
        ? (input.taskType as CommerceTaskType)
        : 'product-main'

      setMode(nextMode)
      setTask(nextTask)
      setView('create')
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
      setCount(Math.min(16, Math.max(1, Number(input.count) || 1)))
      setModel((input.model as GenerationModel) ?? 'gpt-image-2')
      setAspectRatio(input.aspectRatio ?? '1:1')
      setResolution(input.resolution ?? '2K')
      setProductFiles(nextProductFiles)
      setReferenceFiles(nextReferenceFiles)
      setHistoryTask(null)
      setHistoryOpen(false)
      router.replace(nextMode === 'general' ? '/workbench?mode=general' : `/workbench?mode=commerce&task=${nextTask}`)
      const message = '已载入历史记录的配置，可继续调整后生成'
      if (nextMode === mode && (nextMode === 'general' || nextTask === task)) setNotice({ kind: 'success', message })
      else pendingNoticeRef.current = { kind: 'success', message }
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : '载入配置失败' })
    } finally {
      setLoadingConfigId(null)
    }
  }

  /** 用一条历史记录自己的配置再生成一次：先回填配置，再走二次确认 */
  async function regenerateFromHistory(historyTaskToLoad: HistoryTask) {
    await loadHistoryConfig(historyTaskToLoad)
    if (shouldSkipRegenerateConfirm()) {
      createGenerationTask()
      return
    }
    // 与上一批 state 更新同一批提交，弹窗里展示的就是刚载入的配置
    setConfirmOpen(true)
  }

  /** 重新生成前先确认：每次生成都会调用 AI 服务并产生费用 */
  function requestRegenerate() {
    if (shouldSkipRegenerateConfirm()) {
      createGenerationTask()
      return
    }
    setConfirmOpen(true)
  }

  function buildPayload(productAssetIds: string[], referenceAssetIds: string[]): unknown {
    const moduleKeys = task === 'product-main' ? productMainModules.map(([value]) => value) : detailModules.map(([value]) => value)
    const normalizedModuleCounts = Object.fromEntries(Object.entries(moduleCounts).filter(([key]) => moduleKeys.some((moduleKey) => moduleKey === key)))
    const commerceCount = task === 'product-main' || task === 'detail-page'
      ? moduleMode === 'custom' ? Math.max(1, Object.values(normalizedModuleCounts).reduce((total, value) => total + value, 0)) : 1
      : 1
    const imageSettings = { model, aspectRatio, resolution, count: mode === 'general' ? count : commerceCount }

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

    if (task === 'product-main' || task === 'detail-page') return { ...common, requirements, outputLanguage, moduleMode, moduleCounts: normalizedModuleCounts }
    if (task === 'viral-recreate') return { ...common, referenceAssetIds, recreateStrength, requirements, outputLanguage }
    return { ...common, enhancements, requirements }
  }

  function createGenerationTask() {
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
    if (mode === 'commerce' && (task === 'product-main' || task === 'detail-page') && moduleMode === 'custom' && moduleTotal === 0) {
      setNotice({ kind: 'error', message: '自定义模块至少选择 1 个图片模块' })
      return
    }

    const sourceFiles = mode === 'general' ? referenceFiles : task === 'viral-recreate' ? [...productFiles, ...referenceFiles] : productFiles
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
      onAuthRequired: () => {
        const currentUrl = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
        router.push(`/login?next=${encodeURIComponent(currentUrl)}`)
      },
    })
  }

  return (
    <main className="workbench-page">
      <section className={`workbench-shell config-${configSide} view-${view} ${panelOpen ? 'panel-open' : ''}`}>
        <WorkbenchRail
          mode={mode}
          view={view}
          onChangeMode={changeMode}
          onChangeView={changeView}
        />
        <WorkbenchHeader
          mode={mode}
          task={task}
          view={view}
          configSide={configSide}
          panelOpen={panelOpen}
          onChangeTask={changeTask}
          onChangeSide={setConfigSide}
          onTogglePanel={() => setPanelOpen((open) => !open)}
        />
        {view === 'inspire' ? (
          <section className="workbench-inspire" aria-label="灵感提示词">
            <InspirationGallery
              onUsePrompt={(nextPrompt) => {
                setPrompt(nextPrompt)
                changeMode('general')
              }}
            />
          </section>
        ) : (
          <>
            <CreatorSidebar
              mode={mode}
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
              moduleCounts={moduleCounts}
              recreateStrength={recreateStrength}
              enhancements={enhancements}
              count={count}
              model={model}
              aspectRatio={aspectRatio}
              resolution={resolution}
              expectedCount={expectedCount}
              aiEnabled={aiEnabled}
              promptEnhanceEnabled={promptEnhanceEnabled}
              notice={notice}
              isSubmitting={isSubmitting}
              isGenerating={isGenerating}
              onSetProductFiles={setProductFiles}
              onSetReferenceFiles={setReferenceFiles}
              onSetPrompt={setPrompt}
              onSetRequirements={setRequirements}
              onSetPlatform={setPlatform}
              onSetOutputLanguage={setOutputLanguage}
              onSetStyle={setStyle}
              onSetReferenceStrength={setReferenceStrength}
              onSetModuleMode={setModuleMode}
              onSetModuleCounts={setModuleCounts}
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
              aiEnabled={aiEnabled}
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
              onUseImageAsReference={(path, source) => void useImageAsReference(path, source)}
              isRegeneratingHistory={loadingConfigId !== null}
              onSetActiveResultIndex={setActiveResultIndex}
              onRegenerate={requestRegenerate}
            />
          </>
        )}
      </section>

      {confirmOpen && (
        <RegenerateDialog
          title={title}
          rows={configRows}
          expectedCount={expectedCount}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); createGenerationTask() }}
        />
      )}
    </main>
  )
}
