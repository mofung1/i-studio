'use client'

import { Box, LayoutPanelLeft, PanelRight, WandSparkles } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AccountChip, AppShell, ServicePill } from './app-shell'
import { useAiEnabled } from './use-ai-enabled'
import { getAccessToken } from '@/lib/api'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { CanvasPanel } from './workbench/canvas-panel'
import {
  commerceTasks,
  detailModules,
  pixelSize,
  productMainModules,
  taskMeta,
  type ConfigSide,
  type GeneralStyle,
  type ModuleMode,
  type ReferenceStrength,
  type WorkbenchMode,
} from './workbench/shared'
import { SpecPanel } from './workbench/spec-panel'
import { useGenerationTask } from './workbench/use-generation-task'

interface WorkbenchProps {
  initialMode: WorkbenchMode
  initialTask: CommerceTaskType
  initialPrompt?: string
  initialModel?: string
  initialAspectRatio?: string
  initialResolution?: string
  initialCount?: string
}

/** 生成页就是首页：没有落地页，打开就是工单与画布。 */
export function Workbench({
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

  const aiEnabled = useAiEnabled()
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
  } = useGenerationTask(`${mode}:${task}`)

  const hasProductImage = productFiles.length > 0

  useEffect(() => {
    const saved = window.localStorage.getItem('istudio-ui2-panel-side')
    setConfigSide(saved === 'right' ? 'right' : 'left')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('istudio-ui2-panel-side', configSide)
  }, [configSide])

  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const pageTitle = mode === 'general' ? '通用生图' : `生成${currentTask.title}`
  const pageDescription = mode === 'general' ? '用一句话或一张参考图构建画面' : currentTask.description
  const moduleTotal = Object.values(moduleCounts).reduce((sum, value) => sum + value, 0)
  const outputCount =
    mode === 'general'
      ? count
      : task === 'product-main' || task === 'detail-page'
        ? moduleMode === 'custom'
          ? Math.max(1, moduleTotal)
          : 1
        : 1
  const totalImages = resultHistory.reduce((total, item) => total + (item.resultImages?.length ?? 0), 0)

  const requirementsPlaceholder =
    task === 'product-main' || task === 'detail-page'
      ? '建议写清：产品名称、核心卖点、目标人群、主图风格、平台规范。'
      : '选填，例如：去掉背景杂物、增强产品光泽、修复划痕、提升整体清晰度。'

  function currentUrl() {
    return `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`
  }

  function syncUrl(query: string) {
    router.replace(query ? `/?${query}` : '/')
  }

  function changeMode(nextMode: WorkbenchMode) {
    setMode(nextMode)
    setNotice(null)
    syncUrl(nextMode === 'general' ? 'mode=general' : `mode=commerce&task=${task}`)
  }

  function changeTask(nextTask: CommerceTaskType) {
    setTask(nextTask)
    setMode('commerce')
    setNotice(null)
    syncUrl(`mode=commerce&task=${nextTask}`)
  }

  function buildPayload(productAssetIds: string[], referenceAssetIds: string[]): unknown {
    const moduleKeys = task === 'product-main' ? productMainModules.map(([value]) => value) : detailModules.map(([value]) => value)
    const normalizedModuleCounts = Object.fromEntries(
      Object.entries(moduleCounts).filter(([key]) => moduleKeys.some((moduleKey) => moduleKey === key)),
    )
    const commerceCount =
      task === 'product-main' || task === 'detail-page'
        ? moduleMode === 'custom'
          ? Math.max(1, Object.values(normalizedModuleCounts).reduce((total, value) => total + value, 0))
          : 1
        : 1
    const imageSettings = { model, aspectRatio, resolution, count: mode === 'general' ? count : commerceCount }

    if (mode === 'general') {
      return { mode: 'general', prompt, referenceAssetIds, style, referenceStrength, ...imageSettings }
    }

    const common = {
      mode: 'commerce',
      taskType: task,
      productAssetIds,
      platform,
      consistencyProtection: true,
      ...imageSettings,
    }

    if (task === 'product-main' || task === 'detail-page') {
      return { ...common, requirements, outputLanguage, moduleMode, moduleCounts: normalizedModuleCounts }
    }
    if (task === 'viral-recreate') {
      return { ...common, referenceAssetIds, recreateStrength, requirements, outputLanguage }
    }
    return { ...common, enhancements, requirements }
  }

  function createGenerationTask() {
    const token = getAccessToken()
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(currentUrl())}`)
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
      setNotice({ kind: 'error', message: '爆款复刻需要 1 张参考爆款图' })
      return
    }

    const sourceFiles =
      mode === 'general' ? referenceFiles : task === 'viral-recreate' ? [...productFiles, ...referenceFiles] : productFiles
    if (sourceFiles.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setNotice({ kind: 'error', message: '本次上传图片总大小不能超过 20 MB' })
      return
    }

    void submit({
      productFiles,
      referenceFiles,
      buildPayload,
      onAuthRequired: () => router.push(`/login?next=${encodeURIComponent(currentUrl())}`),
    })
  }

  // ⌘/Ctrl + Enter 直接提交，和按钮等价
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      createGenerationTask()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function useStarter(nextPrompt: string) {
    if (mode === 'general') setPrompt(nextPrompt)
    else setRequirements(nextPrompt)
    setNotice(null)
  }

  return (
    <AppShell
      topbar={
        <header className="topbar">
          <nav className="pillnav" aria-label="生图模式">
            <button type="button" aria-pressed={mode === 'general'} onClick={() => changeMode('general')}>
              <span className="dot" aria-hidden="true" />
              <WandSparkles size={14} aria-hidden="true" />
              通用生图
            </button>
            <button type="button" aria-pressed={mode === 'commerce'} onClick={() => changeMode('commerce')}>
              <span className="dot" aria-hidden="true" />
              <Box size={14} aria-hidden="true" />
              电商工具
            </button>
          </nav>

          {mode === 'commerce' && (
            <>
              <span className="topbar-rule" aria-hidden="true" />
              <nav className="tabs" aria-label="商品任务">
                {commerceTasks.map(([taskId, meta]) => (
                  <button
                    key={taskId}
                    type="button"
                    aria-pressed={task === taskId}
                    title={meta.description}
                    onClick={() => changeTask(taskId)}
                  >
                    {meta.title}
                  </button>
                ))}
              </nav>
            </>
          )}

          <span className="topbar-spacer" />

          <div className="topbar-right">
            <ServicePill aiEnabled={aiEnabled} />
            <div className="ico-group" role="group" aria-label="设置面板位置">
              <button
                type="button"
                aria-pressed={configSide === 'left'}
                aria-label="设置面板在左侧"
                title="设置面板在左侧"
                onClick={() => setConfigSide('left')}
              >
                <LayoutPanelLeft size={15} />
              </button>
              <button
                type="button"
                aria-pressed={configSide === 'right'}
                aria-label="设置面板在右侧"
                title="设置面板在右侧"
                onClick={() => setConfigSide('right')}
              >
                <PanelRight size={15} />
              </button>
            </div>
            <AccountChip />
          </div>
        </header>
      }
    >
      <div className={`workspace${configSide === 'right' ? ' flip' : ''}`}>
        <header className="page-head">
          <div className="page-head-text">
            <h1>{pageTitle}</h1>
            <p>{pageDescription}</p>
          </div>
          <div className="chips">
            <span className="chip num">{aspectRatio}</span>
            <span className="chip num">{resolution}</span>
            <span className="chip is-plain num">{pixelSize(aspectRatio, resolution)}</span>
            <span className="chip is-lime num">
              {totalImages > 0 ? `已出 ${totalImages} 张` : `产出 ${outputCount} 张`}
            </span>
          </div>
        </header>
        <SpecPanel
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
          aiEnabled={aiEnabled}
          notice={notice}
          isSubmitting={isSubmitting}
          isGenerating={isGenerating}
          generationTask={generationTask}
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
          onSubmit={createGenerationTask}
        />
        <CanvasPanel
          mode={mode}
          task={task}
          aspectRatio={aspectRatio}
          resolution={resolution}
          resultHistory={resultHistory}
          activeResultIndex={activeResultIndex}
          activeResult={activeResult}
          generationTask={generationTask}
          isGenerating={isGenerating}
          isSubmitting={isSubmitting}
          aiEnabled={aiEnabled}
          onUseStarter={useStarter}
          onSetActiveResultIndex={setActiveResultIndex}
          onSetReferenceFiles={setReferenceFiles}
          onRegenerate={createGenerationTask}
        />
      </div>
    </AppShell>
  )
}
