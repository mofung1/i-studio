'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AppShell } from './app-shell'
import { useAiEnabled } from './use-ai-enabled'
import { getAccessToken } from '@/lib/api'
import type { CommerceTaskType, GenerationModel } from '@/lib/contracts'

import { LightTable } from './workbench/light-table'
import {
  detailModules,
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
import { WorkbenchBar } from './workbench/workbench-bar'

interface WorkbenchProps {
  initialMode: WorkbenchMode
  initialTask: CommerceTaskType
  initialPrompt?: string
  initialModel?: string
  initialAspectRatio?: string
  initialResolution?: string
  initialCount?: string
}

/** 工作台就是首页：没有落地页，打开就是工单与灯箱。 */
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
    const saved = window.localStorage.getItem('istudio-ui1-panel-side')
    setConfigSide(saved === 'right' ? 'right' : 'left')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('istudio-ui1-panel-side', configSide)
  }, [configSide])

  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title

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

  return (
    <AppShell
      bar={
        <WorkbenchBar
          mode={mode}
          task={task}
          configSide={configSide}
          aiEnabled={aiEnabled}
          onChangeMode={changeMode}
          onChangeTask={changeTask}
          onChangeSide={setConfigSide}
        />
      }
    >
      <div className={`workbench config-${configSide}`}>
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
        <LightTable
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
          onSetActiveResultIndex={setActiveResultIndex}
          onSetReferenceFiles={setReferenceFiles}
          onRegenerate={createGenerationTask}
        />
      </div>
    </AppShell>
  )
}
