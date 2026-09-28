'use client'

import {
  AlertTriangle, Check, Download, History, Image as ImageIcon, Loader2, Maximize2, RotateCcw, SlidersHorizontal, Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

import type { CommerceTaskType } from '@/lib/contracts'

import { GenerationHistory } from './generation-history'
import { HistoryDrawer } from './history-drawer'
import { ImageLightbox } from './image-lightbox'
import { RegenerateDialog, shouldSkipRegenerateConfirm } from './regenerate-dialog'
import { ResultActions } from './result-actions'
import { generalCanvasImage, moduleLabel, taskMeta, type WorkbenchMode } from './shared'
import { taskModeLabel, type HistoryTask } from './use-task-history'
import { generationStatusLabels, type InlineGenerationTask } from './use-generation-task'

interface ResultWorkspaceProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  aspectRatio: string
  resolution: string
  expectedCount: number
  /** 提交生成时快照的产出张数：生成中修改参数不会影响加载占位数量 */
  generatingCount: number | null
  resultHistory: InlineGenerationTask[]
  activeResultIndex: number
  activeResult: InlineGenerationTask | null
  generationTask: InlineGenerationTask | null
  isGenerating: boolean
  isSubmitting: boolean
  aiEnabled: boolean | null
  /** 二次确认弹窗里展示的当前配置 */
  configRows: ReadonlyArray<readonly [string, string]>
  /** 历史记录抽屉 */
  historyOpen: boolean
  historyTask: HistoryTask | null
  loadingHistoryConfigId: string | null
  onToggleHistory: () => void
  onSelectHistory: (task: HistoryTask) => void
  onExitHistoryView: () => void
  onLoadHistoryConfig: (task: HistoryTask) => void
  onSetActiveResultIndex: (updater: (index: number) => number) => void
  onSetReferenceFiles: (updater: (files: File[]) => File[]) => void
  onRegenerate: () => void
}

const MAX_SKELETONS = 8

/** 右侧结果工作区：当前任务结果 + 历史记录抽屉 + 图片查看/裁剪。 */
export function ResultWorkspace({
  mode, task, aspectRatio, resolution, expectedCount, generatingCount,
  resultHistory, activeResultIndex, activeResult, generationTask,
  isGenerating, isSubmitting, aiEnabled, configRows,
  historyOpen, historyTask, loadingHistoryConfigId,
  onToggleHistory, onSelectHistory, onExitHistoryView, onLoadHistoryConfig,
  onSetActiveResultIndex, onSetReferenceFiles, onRegenerate,
}: ResultWorkspaceProps) {
  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const referenceImage = mode === 'general' ? generalCanvasImage : currentTask.image

  const [activeImageIndex, setActiveImageIndex] = useState(0)
  // 从「最近生成」里指定了具体某张图时，切版本后要落在这张图上而不是第一张
  const pendingImageRef = useRef<number | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [referenceError, setReferenceError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const isHistoryView = Boolean(historyTask)
  const sessionImages = activeResult?.resultImages ?? []
  const images = isHistoryView ? (historyTask?.resultImages ?? []) : sessionImages
  const safeIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0))
  const heroImage = images[safeIndex] ?? ''
  const hasResults = images.length > 0
  const failureMessage = generationTask && !isGenerating && generationTask.status !== 'succeeded'
    ? generationTask.errorMessage || '供应商未返回错误详情，请重试。'
    : ''

  useEffect(() => {
    setActiveImageIndex(pendingImageRef.current ?? 0)
    pendingImageRef.current = null
    setLightboxOpen(false)
  }, [activeResult?.id, historyTask?.id])

  // 生成完成后刷新历史抽屉，新结果会立刻出现在记录里
  useEffect(() => {
    if (!isGenerating && generationTask) setRefreshKey((value) => value + 1)
  }, [generationTask?.id, generationTask?.status, isGenerating])

  async function useAsReference(path: string) {
    setReferenceError('')
    try {
      const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
      const token = getAccessToken()
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      if (!response.ok) throw new Error('图片读取失败，请稍后重试')
      const blob = await response.blob()
      const filename = `ref-${path.split('/').pop() ?? 'image.png'}`
      const file = new File([blob], filename, { type: blob.type || 'image/png' })
      onSetReferenceFiles((previous) => [...previous, file].slice(0, 6))
      // 参考图已填入左侧，滚动到素材区让用户确认
      document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : '图片读取失败，请稍后重试')
    }
  }

  function downloadCurrent() {
    if (!heroImage) return
    const prefix = isHistoryView ? historyTask?.id.slice(0, 8) : activeResult?.id.slice(0, 8)
    void downloadProtectedAsset(heroImage, `istudio-${prefix ?? 'result'}-${safeIndex + 1}.png`)
  }

  function requestRegenerate() {
    if (shouldSkipRegenerateConfirm()) {
      onRegenerate()
      return
    }
    setConfirmOpen(true)
  }

  return (
    <section className="creation-canvas result-workspace">
      <header className="result-head">
        <div className="result-meta">
          <span className="meta-chip">{expectedCount > 0 ? `${expectedCount} 张` : '—'}</span>
          <span className="meta-chip">{aspectRatio}</span>
          <span className="meta-chip">{resolution}</span>
          <button
            type="button"
            className={`history-trigger ${historyOpen ? 'is-active' : ''}`}
            aria-expanded={historyOpen}
            onClick={onToggleHistory}
          >
            <History size={15} aria-hidden="true" />历史记录
          </button>
        </div>
      </header>

      <div className="result-body">
        {isGenerating && !isHistoryView && (
          <div className="result-generating">
            <div className="result-generating-head">
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
              <strong>{generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}</strong>
              <span>结果返回后会自动显示在这里。</span>
            </div>
            <div className="result-skeletons" aria-hidden="true">
              {Array.from({ length: Math.min(Math.max(generatingCount ?? expectedCount, 1), MAX_SKELETONS) }, (_, index) => <span key={index} />)}
            </div>
          </div>
        )}

        {!isGenerating && !hasResults && !isHistoryView && (
          <div className="result-empty">
            <span className="result-empty-icon"><Sparkles size={22} aria-hidden="true" /></span>
            <h2>生成你的第一张图片</h2>
            <p>{mode === 'general' ? '上传参考图片或描述你的想法。' : '上传商品原图并补充需求即可开始。'}</p>
            {failureMessage && (
              <p className="result-empty-error" role="alert">
                <AlertTriangle size={15} aria-hidden="true" />
                <span><strong>生成失败</strong>{failureMessage}</span>
              </p>
            )}
            <figure className="result-reference">
              <img src={referenceImage} alt={`${title}设计参考图`} loading="lazy" />
              <figcaption><ImageIcon size={13} aria-hidden="true" />设计参考图，非生成结果</figcaption>
            </figure>
          </div>
        )}

        {heroImage !== '' && (!isGenerating || isHistoryView) && (
          <div className="result-result">
            <div className="result-stage">
              <div className="result-hero">
                <AuthenticatedImage path={heroImage} alt={`AI 生成结果 ${safeIndex + 1}`} className="result-hero-image" />
                {moduleLabel(task, (isHistoryView ? historyTask?.resultModules?.[safeIndex] : activeResult?.resultModules?.[safeIndex]) ?? '') && (
                  <span className="module-badge">
                    {moduleLabel(task, (isHistoryView ? historyTask?.resultModules?.[safeIndex] : activeResult?.resultModules?.[safeIndex]) ?? '')}
                  </span>
                )}
                <div className="result-hero-actions">
                  <button type="button" title="放大 / 裁剪" aria-label="放大查看并裁剪这张图片" onClick={() => setLightboxOpen(true)}>
                    <Maximize2 size={16} />
                  </button>
                  <button type="button" title="下载" aria-label="下载这张图片" onClick={downloadCurrent}>
                    <Download size={16} />
                  </button>
                  <button type="button" title="用作参考图继续迭代" aria-label="把这张图片用作参考图" onClick={() => void useAsReference(heroImage)}>
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {images.length > 1 && (
                <ol className="result-strip" aria-label="本次生成的图片">
                  {images.map((path, index) => (
                    <li key={path}>
                      <button
                        type="button"
                        aria-pressed={index === safeIndex}
                        className={index === safeIndex ? 'selected' : ''}
                        aria-label={`查看第 ${index + 1} 张`}
                        onClick={() => setActiveImageIndex(index)}
                      >
                        <AuthenticatedImage path={path} alt={`第 ${index + 1} 张缩略图`} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="result-side">
              <div className="result-side-head">
                <span className="success-label">
                  <Check size={13} aria-hidden="true" />
                  {isHistoryView ? '历史记录' : activeResult?.status === 'succeeded' ? '生成完成' : '部分完成'}
                </span>
                <span>
                  {isHistoryView && historyTask
                    ? `${taskModeLabel(historyTask.input)} · ${images.length} 张`
                    : `第 ${activeResultIndex + 1} / ${resultHistory.length} 次 · ${images.length} 张`}
                </span>
              </div>
              {isHistoryView && historyTask && (
                <div className="result-history-actions">
                  <button
                    type="button"
                    disabled={loadingHistoryConfigId === historyTask.id}
                    onClick={() => onLoadHistoryConfig(historyTask)}
                  >
                    {loadingHistoryConfigId === historyTask.id
                      ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      : <SlidersHorizontal size={14} aria-hidden="true" />}
                    载入配置继续编辑
                  </button>
                  <button type="button" onClick={onExitHistoryView}>回到当前任务</button>
                </div>
              )}
              {failureMessage && !isHistoryView && (
                <p className="result-side-error" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  {failureMessage}
                </p>
              )}
              {referenceError && <p className="result-side-error" role="alert">{referenceError}</p>}
              <p className="result-side-note">
                {isHistoryView
                  ? '可下载或用作参考图。'
                  : '结果已保存到任务记录。'}
              </p>
              <ResultActions
                isBusy={isSubmitting || isGenerating}
                onDownload={downloadCurrent}
                onRegenerate={requestRegenerate}
                onEdit={() => setLightboxOpen(true)}
              />
            </div>
          </div>
        )}
      </div>

      {!isHistoryView && (
        <GenerationHistory
          items={resultHistory}
          activeIndex={activeResultIndex}
          activeImageIndex={safeIndex}
          onSelect={(resultIndex, imageIndex) => {
            pendingImageRef.current = imageIndex
            if (resultIndex === activeResultIndex) {
              setActiveImageIndex(imageIndex)
              pendingImageRef.current = null
              return
            }
            onSetActiveResultIndex(() => resultIndex)
          }}
          onDownload={(path, filename) => void downloadProtectedAsset(path, filename)}
          onUseAsReference={(path) => void useAsReference(path)}
        />
      )}

      <HistoryDrawer
        open={historyOpen}
        mode={mode}
        task={task}
        selectedId={historyTask?.id ?? null}
        loadingConfigId={loadingHistoryConfigId}
        refreshKey={refreshKey}
        onClose={onToggleHistory}
        onSelect={onSelectHistory}
        onDownload={(path, filename) => void downloadProtectedAsset(path, filename)}
        onUseAsReference={(path) => void useAsReference(path)}
        onLoadConfig={onLoadHistoryConfig}
      />

      {lightboxOpen && heroImage && (
        <ImageLightbox
          path={heroImage}
          alt={`${title}生成结果 ${safeIndex + 1}`}
          filename={`istudio-${(isHistoryView ? historyTask?.id : activeResult?.id)?.slice(0, 8) ?? 'result'}-${safeIndex + 1}`}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {confirmOpen && (
        <RegenerateDialog
          title={title}
          rows={configRows}
          expectedCount={expectedCount}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); onRegenerate() }}
        />
      )}
    </section>
  )
}
