'use client'

import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Download, History, Image as ImageIcon, Loader2, RotateCcw, Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'

import type { CommerceTaskType } from '@/lib/contracts'

import { GenerationHistory } from './generation-history'
import { HistoryDrawer } from './history-drawer'
import { ImageLightbox } from './image-lightbox'
import { ResultActions } from './result-actions'
import { generalCanvasImage, moduleLabel, taskMeta, type WorkbenchMode } from './shared'
import { taskModeLabel, type HistoryTask } from './use-task-history'
import { generationStatusLabels, type InlineGenerationTask } from './use-generation-task'

/** 图片来源：决定「用作参考图」跳到哪个生图配置页 */
export interface ImageSource {
  mode: WorkbenchMode
  taskType: CommerceTaskType
}

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
  /** 历史记录抽屉 */
  historyOpen: boolean
  historyTask: HistoryTask | null
  loadingHistoryConfigId: string | null
  isRegeneratingHistory: boolean
  onToggleHistory: () => void
  onSelectHistory: (task: HistoryTask) => void
  onExitHistoryView: () => void
  onLoadHistoryConfig: (task: HistoryTask) => void
  onRegenerateFromHistory: (task: HistoryTask) => void
  onUseImageAsReference: (path: string, source: ImageSource) => void
  onSetActiveResultIndex: (updater: (index: number) => number) => void
  /** 重新生成（是否二次确认由父级决定） */
  onRegenerate: () => void
}

const MAX_SKELETONS = 8

/** 右侧结果工作区：当前任务结果 + 历史记录抽屉 + 图片查看/裁剪。 */
export function ResultWorkspace({
  mode, task, aspectRatio, resolution, expectedCount, generatingCount,
  resultHistory, activeResultIndex, activeResult, generationTask,
  isGenerating, isSubmitting, aiEnabled,
  historyOpen, historyTask, loadingHistoryConfigId, isRegeneratingHistory,
  onToggleHistory, onSelectHistory, onExitHistoryView, onLoadHistoryConfig, onRegenerateFromHistory,
  onUseImageAsReference, onSetActiveResultIndex, onRegenerate,
}: ResultWorkspaceProps) {
  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const referenceImage = mode === 'general' ? generalCanvasImage : currentTask.image

  const [activeImageIndex, setActiveImageIndex] = useState(0)
  // 从「最近生成」里指定了具体某张图时，切版本后要落在这张图上而不是第一张
  const pendingImageRef = useRef<number | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const isHistoryView = Boolean(historyTask)
  const images = isHistoryView ? (historyTask?.resultImages ?? []) : (activeResult?.resultImages ?? [])
  const safeIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0))
  const heroImage = images[safeIndex] ?? ''
  const hasResults = images.length > 0
  const failureMessage = generationTask && !isGenerating && generationTask.status !== 'succeeded'
    ? generationTask.errorMessage || '供应商未返回错误详情，请重试。'
    : ''

  // 结果图所属的生图类型：当前任务就是当前工具，历史记录取记录自己的类型
  const imageSource: ImageSource = isHistoryView && historyTask
    ? {
        mode: historyTask.input.mode === 'commerce' ? 'commerce' : 'general',
        taskType: (historyTask.input.taskType as CommerceTaskType) ?? 'product-main',
      }
    : { mode, taskType: task }
  const referenceTarget = imageSource.mode === 'general' ? '通用生图' : taskMeta[imageSource.taskType]?.title ?? '电商设计'
  const referenceTitle = `用作「${referenceTarget}」的参考图`

  useEffect(() => {
    setActiveImageIndex(pendingImageRef.current ?? 0)
    pendingImageRef.current = null
    setLightboxOpen(false)
  }, [activeResult?.id, historyTask?.id])

  // 生成完成后刷新历史抽屉，新结果会立刻出现在记录里
  useEffect(() => {
    if (!isGenerating && generationTask) setRefreshKey((value) => value + 1)
  }, [generationTask?.id, generationTask?.status, isGenerating])

  function downloadCurrent() {
    if (!heroImage) return
    const prefix = isHistoryView ? historyTask?.id.slice(0, 8) : activeResult?.id.slice(0, 8)
    void downloadProtectedAsset(heroImage, `istudio-${prefix ?? 'result'}-${safeIndex + 1}.png`)
  }

  function step(direction: -1 | 1) {
    const next = safeIndex + direction
    if (next < 0 || next >= images.length) return
    setActiveImageIndex(next)
  }

  return (
    <section className="creation-canvas result-workspace">
      <header className="result-head">
        <div className="result-meta">
          {isHistoryView && historyTask ? (
            <>
              <span className="meta-chip">
                历史记录 · {taskModeLabel(historyTask.input)} · {images.length} 张
              </span>
              <button
                type="button"
                className="meta-action is-primary"
                title="用该记录配置重新生成图片"
                disabled={isRegeneratingHistory}
                onClick={() => onRegenerateFromHistory(historyTask)}
              >
                {isRegeneratingHistory
                  ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  : <RotateCcw size={14} aria-hidden="true" />}
                重新生成
              </button>
              <button type="button" className="meta-action" onClick={onExitHistoryView}>回到当前任务</button>
            </>
          ) : (
            <>
              <span className="meta-chip">{expectedCount > 0 ? `${expectedCount} 张` : '—'}</span>
              <span className="meta-chip">{aspectRatio}</span>
              <span className="meta-chip">{resolution}</span>
            </>
          )}
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
          <div className={isHistoryView ? 'result-result is-single' : 'result-result'}>
            <div className="result-stage">
              <div className="result-hero">
                <button
                  type="button"
                  className="result-hero-open"
                  aria-label={`放大查看第 ${safeIndex + 1} 张`}
                  title="点击查看大图"
                  onClick={() => setLightboxOpen(true)}
                >
                  <AuthenticatedImage path={heroImage} alt={`AI 生成结果 ${safeIndex + 1}`} className="result-hero-image" />
                </button>

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="result-hero-nav is-prev"
                      aria-label="上一张"
                      disabled={safeIndex === 0}
                      onClick={() => step(-1)}
                    ><ChevronLeft size={20} /></button>
                    <button
                      type="button"
                      className="result-hero-nav is-next"
                      aria-label="下一张"
                      disabled={safeIndex === images.length - 1}
                      onClick={() => step(1)}
                    ><ChevronRight size={20} /></button>
                  </>
                )}

                {moduleLabel(task, (isHistoryView ? historyTask?.resultModules?.[safeIndex] : activeResult?.resultModules?.[safeIndex]) ?? '') && (
                  <span className="module-badge">
                    {moduleLabel(task, (isHistoryView ? historyTask?.resultModules?.[safeIndex] : activeResult?.resultModules?.[safeIndex]) ?? '')}
                  </span>
                )}
                {images.length > 1 && (
                  <span className="result-hero-counter">{safeIndex + 1} / {images.length}</span>
                )}

                <div className="result-hero-actions">
                  <button type="button" title="下载" aria-label="下载这张图片" onClick={downloadCurrent}>
                    <Download size={16} />
                  </button>
                  <button
                    type="button"
                    title={referenceTitle}
                    aria-label={referenceTitle}
                    onClick={() => onUseImageAsReference(heroImage, imageSource)}
                  >
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

            {!isHistoryView && (
            <div className="result-side">
              <div className="result-side-head">
                <span className="success-label">
                  <Check size={13} aria-hidden="true" />
                  {activeResult?.status === 'succeeded' ? '生成完成' : '部分完成'}
                </span>
                <span>
                  第 {activeResultIndex + 1} / {resultHistory.length} 次 · {images.length} 张
                </span>
              </div>
              {failureMessage && (
                <p className="result-side-error" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  {failureMessage}
                </p>
              )}
              <p className="result-side-note">结果已保存到任务记录。</p>
              <ResultActions
                isBusy={isSubmitting || isGenerating}
                onDownload={downloadCurrent}
                onRegenerate={onRegenerate}
                onEdit={() => setLightboxOpen(true)}
              />
            </div>
            )}
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
          onUseAsReference={(path) => onUseImageAsReference(path, { mode, taskType: task })}
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
        onUseAsReference={onUseImageAsReference}
        onLoadConfig={onLoadHistoryConfig}
        onRegenerate={onRegenerateFromHistory}
      />

      {lightboxOpen && heroImage && (
        <ImageLightbox
          path={heroImage}
          alt={`${title}生成结果 ${safeIndex + 1}`}
          filename={`istudio-${(isHistoryView ? historyTask?.id : activeResult?.id)?.slice(0, 8) ?? 'result'}-${safeIndex + 1}`}
          hasPrev={images.length > 1 && safeIndex > 0}
          hasNext={images.length > 1 && safeIndex < images.length - 1}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </section>
  )
}
