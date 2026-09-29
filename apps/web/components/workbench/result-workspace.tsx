'use client'

import {
  Check, ChevronLeft, ChevronRight, Download, History, Image as ImageIcon, Loader2, RefreshCw, RotateCcw, Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset, useProtectedImageUrl } from '@/components/authenticated-image'

import type { CommerceTaskType } from '@/lib/contracts'

import { GenerationHistory } from './generation-history'
import { FailureNotice } from './failure-notice'
import { HistoryDrawer } from './history-drawer'
import { ImageLightbox } from './image-lightbox'
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
  /** 删除一条历史记录 */
  onDeleteHistoryTask: (task: HistoryTask) => Promise<void>
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
  onDeleteHistoryTask, onUseImageAsReference, onSetActiveResultIndex, onRegenerate,
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
  // 主图走缓存：同一组结果内左右切换时保留上一张直到新图就绪，不会闪白；
  // 换组（新的一次生成 / 另一条历史记录）则重新显示占位，避免显示过期画面。
  const heroGroup = isHistoryView ? historyTask?.id ?? 'history' : activeResult?.id ?? 'current'
  const { source: heroSource, state: heroState, retry: retryHero } = useProtectedImageUrl(heroImage, heroGroup)
  const heroReady = heroState === 'loaded' && heroSource !== ''
  const heroFailed = heroState === 'failed'
  // 加载占位按当前比例铺开，尺寸与生成后的图片一致
  const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number)
  const heroRatio = ratioWidth && ratioHeight ? ratioWidth / ratioHeight : 1
  const heroRatioCss = ratioWidth && ratioHeight ? `${ratioWidth} / ${ratioHeight}` : '1 / 1'
  const generatingImages = Math.min(Math.max(generatingCount ?? expectedCount, 1), MAX_SKELETONS)
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
              {hasResults && !isGenerating && (
                <span className="meta-chip is-status">
                  <Check size={12} aria-hidden="true" />
                  {activeResult?.status === 'succeeded' ? '生成完成' : '部分完成'} · 第 {activeResultIndex + 1}/{resultHistory.length} 次 · {images.length} 张
                </span>
              )}
              {isGenerating && (
                <span className="meta-chip is-status">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  {generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}
                </span>
              )}
              <span className="meta-chip">{expectedCount > 0 ? `${expectedCount} 张` : '—'}</span>
              <span className="meta-chip">{aspectRatio}</span>
              <span className="meta-chip">{resolution}</span>
              <button
                type="button"
                className="meta-action is-primary"
                title="用当前左侧配置再生成一次"
                disabled={isSubmitting || isGenerating}
                onClick={onRegenerate}
              >
                <RotateCcw size={14} aria-hidden="true" />重新生成
              </button>
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
            <div className={`result-stage${generatingImages > 1 ? ' has-strip' : ''}`} aria-hidden="true">
              {/* 占位尺寸与生成后的主图一致：同比例、同最大高度 */}
              <div
                className="result-hero-skeleton"
                style={{ aspectRatio: heroRatioCss, maxWidth: `calc(var(--hero-max) * ${heroRatio})` }}
              >
                <span className="skeleton-shimmer" />
              </div>
              {generatingImages > 1 && (
                <div className="result-strip-skeleton">
                  {Array.from({ length: generatingImages }, (_, index) => (
                    <span key={index}><span className="skeleton-shimmer" /></span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!isGenerating && !hasResults && !isHistoryView && (
          <div className="result-empty">
            <span className="result-empty-icon"><Sparkles size={22} aria-hidden="true" /></span>
            <h2>生成你的第一张图片</h2>
            <p>{mode === 'general' ? '上传参考图片或描述你的想法。' : '上传商品原图并补充需求即可开始。'}</p>
            {failureMessage && (
              <FailureNotice message={failureMessage} />
            )}
            <figure className="result-reference">
              <img src={referenceImage} alt={`${title}设计参考图`} loading="lazy" />
              <figcaption><ImageIcon size={13} aria-hidden="true" />设计参考图，非生成结果</figcaption>
            </figure>
          </div>
        )}

        {failureMessage && hasResults && !isHistoryView && !isGenerating && (
          <FailureNotice message={failureMessage} compact />
        )}

        {heroImage !== '' && (!isGenerating || isHistoryView) && (
          <div className="result-result">
            <div className={`result-stage${images.length > 1 ? ' has-strip' : ''}`}>
              {/* 图片就绪前先按当前比例撑出与结果一致的画框，避免生成完成时塌陷或跳动 */}
              <div
                className="result-hero"
                style={heroReady ? undefined : {
                  width: `min(100%, calc(var(--hero-max) * ${heroRatio}))`,
                  aspectRatio: heroRatioCss,
                }}
              >
                {heroReady ? (
                  <button
                    type="button"
                    className="result-hero-open"
                    aria-label={`放大查看第 ${safeIndex + 1} 张`}
                    title="点击查看大图"
                    onClick={() => setLightboxOpen(true)}
                  >
                    <img className="result-hero-image" src={heroSource} alt={`AI 生成结果 ${safeIndex + 1}`} />
                  </button>
                ) : (
                  <div
                    className={`result-hero-pending${heroFailed ? ' is-failed' : ''}`}
                    role={heroFailed ? 'alert' : 'status'}
                    aria-label={heroFailed ? '结果图加载失败' : '结果图加载中'}
                  >
                    {heroFailed && (
                      <button type="button" onClick={retryHero} title="重新加载" aria-label="重新加载结果图">
                        <RefreshCw size={16} />
                      </button>
                    )}
                  </div>
                )}

                {moduleLabel(task, (isHistoryView ? historyTask?.resultModules?.[safeIndex] : activeResult?.resultModules?.[safeIndex]) ?? '') && (
                  <span className="module-badge">
                    {moduleLabel(task, (isHistoryView ? historyTask?.resultModules?.[safeIndex] : activeResult?.resultModules?.[safeIndex]) ?? '')}
                  </span>
                )}

                {heroReady && (
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
                )}
              </div>

              {/* 切换按钮放在图片下方，不遮挡画面 */}
              {images.length > 1 && (
                <div className="result-pager">
                  <button
                    type="button"
                    aria-label="上一张"
                    disabled={safeIndex === 0}
                    onClick={() => step(-1)}
                  ><ChevronLeft size={16} /></button>
                  <span className="result-pager-count">{safeIndex + 1} / {images.length}</span>
                  <button
                    type="button"
                    aria-label="下一张"
                    disabled={safeIndex === images.length - 1}
                    onClick={() => step(1)}
                  ><ChevronRight size={16} /></button>
                </div>
              )}

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

          </div>
        )}

        {/* 生成过程中不显示「最近生成」；放在滚动区内，不占用主图高度 */}
        {!isHistoryView && !isGenerating && (
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
      </div>

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
        onDelete={onDeleteHistoryTask}
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
