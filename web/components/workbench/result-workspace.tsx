'use client'

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  AuthenticatedImage,
  downloadProtectedAsset,
  useProtectedImageUrl,
} from '@/components/authenticated-image'
import { ImageComparisonButton } from '@/components/image-comparison-button'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import { clothingModelRecipe, detailPageRecipe, productMainRecipe } from '@/lib/commerce-recipe'
import { frontendRequest } from '@/lib/frontend-request'
import { comparisonCandidates, comparisonReferences } from '@/lib/image-comparison'

import type { CommerceTaskType } from '@/lib/contracts'

import { GenerationHistory } from './generation-history'
import { GenerationLoading } from './generation-loading'
import { FailureNotice } from './failure-notice'
import { HistoryDrawer } from './history-drawer'
import { ImageLightbox } from './image-lightbox'
import { ImageViewport } from './image-viewport'
import { RedoImageDialog } from './redo-image-dialog'
import { moduleLabel, taskMeta, type WorkbenchMode } from './shared'
import { activeTaskStatuses, taskModeLabel, type HistoryTask } from './use-task-history'
import {
  generationStatusLabels,
  type InlineGenerationTask,
  type SubmitImageRedo,
} from './use-generation-task'

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
  onRedoImage?: SubmitImageRedo
  isRecipe?: boolean
  onConfigure?: () => void
  starter?: ReactNode
}

const MAX_SKELETONS = 8
const groupTitles: Partial<Record<CommerceTaskType, string>> = {
  'product-main': productMainRecipe.title,
  'detail-page': detailPageRecipe.title,
  'clothing-set': '服装组图',
}

interface RedoSelection {
  taskId: string
  assetId: string
  modelId: string
  label: string
}

interface PreviewImage {
  group: string
  path: string
  source: string
}

interface LoadedPreview extends PreviewImage {
  width: number
  height: number
}

type ArchiveDownload = { taskId: string } & (
  | { imageCount: number; expectedCount: number }
  | { error: string }
)

/** 右侧结果工作区：当前任务结果 + 历史记录抽屉 + 图片查看/裁剪。 */
export function ResultWorkspace({
  mode,
  task,
  aspectRatio,
  resolution,
  expectedCount,
  generatingCount,
  resultHistory,
  activeResultIndex,
  activeResult,
  generationTask,
  isGenerating,
  isSubmitting,
  historyOpen,
  historyTask,
  loadingHistoryConfigId,
  isRegeneratingHistory,
  onToggleHistory,
  onSelectHistory,
  onExitHistoryView,
  onLoadHistoryConfig,
  onRegenerateFromHistory,
  onDeleteHistoryTask,
  onUseImageAsReference,
  onSetActiveResultIndex,
  onRegenerate,
  onRedoImage,
  isRecipe,
  onConfigure,
  starter,
}: ResultWorkspaceProps) {
  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title

  const [activeImageIndex, setActiveImageIndex] = useState(0)
  // 从「最近生成」里指定了具体某张图时，切版本后要落在这张图上而不是第一张
  const pendingImageRef = useRef<number | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [downloadError, setDownloadError] = useState<{ taskId?: string; message: string } | null>(
    null,
  )
  const [downloadGroupBusy, setDownloadGroupBusy] = useState(false)
  const [archiveDownload, setArchiveDownload] = useState<ArchiveDownload | null>(null)
  const [redoSelection, setRedoSelection] = useState<RedoSelection | null>(null)
  const [redoOriginBusy, setRedoOriginBusy] = useState(false)
  const [redoOriginError, setRedoOriginError] = useState('')
  const redoOriginRequest = useRef<AbortController | null>(null)
  const resultHeader = useRef<HTMLElement>(null)
  const [loadedPreview, setLoadedPreview] = useState<LoadedPreview | null>(null)
  const [failedPreview, setFailedPreview] = useState<PreviewImage | null>(null)

  const isHistoryView = Boolean(historyTask)
  const displayTask = historyTask ?? (isGenerating ? generationTask : activeResult)
  const displayTaskId = displayTask?.id
  const images = displayTask?.resultImages ?? []
  const displayModules = displayTask?.resultModules
  const imageDetails = displayTask?.resultDetails
  const generationTotal = generationTask?.input?.count ?? generatingCount ?? expectedCount
  const safeIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0))
  const heroImage = images[safeIndex] ?? ''
  const actualDetail = imageDetails?.find((item) => item.contentPath === heroImage)
  const hasResults = images.length > 0
  const displayInput = displayTask?.input
  const displayRatio = displayInput?.aspectRatio ?? aspectRatio
  const displayResolution = displayInput?.resolution ?? resolution
  const heroGroup = displayTaskId ?? 'current'
  const {
    source: heroSource,
    resolvedPath,
    state: heroState,
    retry: retryHero,
  } = useProtectedImageUrl(heroImage, heroGroup)
  const selectedPreview =
    heroState === 'loaded' && resolvedPath === heroImage && heroSource
      ? { group: heroGroup, path: heroImage, source: heroSource }
      : null
  // 保留已完成浏览器加载的旧图，等新图触发 load 后再把同一个节点切到前台。
  const visiblePreview =
    loadedPreview?.group === heroGroup && images.includes(loadedPreview.path) ? loadedPreview : null
  if (loadedPreview && !visiblePreview) setLoadedPreview(null)
  const heroFailed =
    heroState === 'failed' ||
    (selectedPreview !== null &&
      failedPreview?.group === heroGroup &&
      failedPreview.path === selectedPreview.path &&
      failedPreview.source === selectedPreview.source)
  const heroReady =
    !heroFailed &&
    selectedPreview !== null &&
    visiblePreview?.path === selectedPreview.path &&
    visiblePreview.source === selectedPreview.source
  const previews: PreviewImage[] = visiblePreview ? [visiblePreview] : []
  if (selectedPreview && !heroReady && !heroFailed) previews.push(selectedPreview)
  const visibleIndex =
    visiblePreview && !heroFailed ? images.indexOf(visiblePreview.path) : safeIndex

  const [ratioWidth, ratioHeight] = displayRatio.split(':').map(Number)
  const heroRatio = ratioWidth && ratioHeight ? ratioWidth / ratioHeight : 1
  const imageRatio = visiblePreview ? visiblePreview.width / visiblePreview.height : heroRatio
  const generatingImages = Math.min(Math.max(generationTotal, 1), MAX_SKELETONS)
  const failureMessage =
    generationTask && !isGenerating && generationTask.status !== 'succeeded'
      ? generationTask.errorMessage || '供应商未返回错误详情，请重试。'
      : ''

  // 跨工具历史重做生成的任务仍归属于原电商工具。
  const imageSource: ImageSource =
    isHistoryView || displayInput?.redoSourceTaskId
      ? {
          mode: displayInput?.mode === 'commerce' ? 'commerce' : 'general',
          taskType:
            (displayInput && 'taskType' in displayInput
              ? (displayInput.taskType as CommerceTaskType)
              : undefined) ?? 'product-main',
        }
      : { mode, taskType: task }
  const comparisonSources = comparisonReferences(
    displayInput,
    imageSource.taskType === 'clothing-set' ? '服装原图' : '商品原图',
  )
  const comparisonImages = comparisonCandidates([
    ...images.map((path, index) => ({ path, label: `当前结果 · 第 ${index + 1} 张` })),
    ...comparisonSources,
    ...resultHistory.flatMap((item, index) =>
      (item.resultImages ?? []).map((path, imageIndex) => ({
        path,
        label: `版本 ${index + 1} · 第 ${imageIndex + 1} 张`,
      })),
    ),
  ])
  const productOriginal =
    imageSource.mode === 'commerce' && comparisonImages.some(({ path }) => path === heroImage)
      ? comparisonSources.find(
          ({ path, isProductOriginal }) => isProductOriginal && path !== heroImage,
        )
      : undefined
  const referenceTarget =
    imageSource.mode === 'general'
      ? '通用生图'
      : (taskMeta[imageSource.taskType]?.title ?? '电商设计')
  const referenceTitle = `用作「${referenceTarget}」的参考图`
  const isGeneratedClothing =
    displayInput &&
    'clothingModelSource' in displayInput &&
    displayInput.clothingModelSource === 'generated'
  const plannedCount = displayInput?.count ?? (isGenerating && !isHistoryView ? generationTotal : 0)
  const viewingRecipe = !isHistoryView && isRecipe
  const isClothing = imageSource.taskType === 'clothing-set'
  const useClothingRecipeTitle =
    isClothing && (isGeneratedClothing || (!displayInput && viewingRecipe))
  const archiveTitle = useClothingRecipeTitle
    ? clothingModelRecipe.title
    : groupTitles[imageSource.taskType]
  const groupTitle =
    imageSource.mode === 'commerce' &&
    !displayInput?.redoSourceTaskId &&
    (!historyTask || historyTask.input.taskType) &&
    (viewingRecipe || isClothing || plannedCount > 1 || images.length > 1)
      ? archiveTitle
      : undefined
  const partialGroup = displayTask?.status !== 'succeeded' || plannedCount > images.length
  const archiveResult = archiveDownload?.taskId === displayTaskId ? archiveDownload : null
  const archiveError = archiveResult && 'error' in archiveResult ? archiveResult.error : ''
  const downloadedArchive = archiveResult && 'imageCount' in archiveResult ? archiveResult : null
  const archiveMissing = downloadedArchive
    ? downloadedArchive.expectedCount - downloadedArchive.imageCount
    : Math.max(0, plannedCount - images.length)
  const archiveWarning = archiveError !== '' || archiveMissing > 0
  const missingNotice = archiveMissing > 0 ? `，缺少 ${archiveMissing} 张` : ''
  let archiveNotice = ''
  if (archiveError) {
    archiveNotice = archiveError
  } else if (downloadedArchive) {
    archiveNotice = `ZIP 已打包 ${downloadedArchive.imageCount} / ${downloadedArchive.expectedCount} 张${missingNotice}。`
  } else if (archiveMissing > 0 && (!isGenerating || isHistoryView)) {
    archiveNotice = `本套已有 ${images.length} / ${plannedCount} 张成片${missingNotice}。`
  }
  const currentModule = displayModules?.[safeIndex] ?? ''
  // 删除或缺失一张结果后，图片下标可能已经与原拍摄顺序不同。
  const shot =
    isGeneratedClothing && displayInput.clothingPlan?.length === images.length
      ? displayInput.clothingPlan[safeIndex]
      : undefined
  const imageLabel =
    shot?.moduleKey === currentModule
      ? shot.label
      : moduleLabel(imageSource.taskType, currentModule)
  const redoAssetId = /^\/v1\/assets\/([\w-]+)\/content$/.exec(heroImage)?.[1]
  const redoModelId = displayInput?.endpointId
  const redoCandidate: RedoSelection | null =
    onRedoImage &&
    displayTaskId &&
    redoAssetId &&
    redoModelId &&
    !activeTaskStatuses.has(displayTask?.status ?? '') &&
    imageSource.mode === 'commerce' &&
    imageLabel &&
    (imageSource.taskType === 'product-main' ||
      imageSource.taskType === 'detail-page' ||
      isGeneratedClothing)
      ? { taskId: displayTaskId, assetId: redoAssetId, modelId: redoModelId, label: imageLabel }
      : null
  const failedRedoInput =
    !isHistoryView && failureMessage && !generationTask?.resultImages?.length
      ? generationTask?.input
      : undefined
  const redoInput = failedRedoInput?.redoSourceTaskId ? failedRedoInput : displayInput

  useEffect(() => {
    setActiveImageIndex(pendingImageRef.current ?? 0)
    pendingImageRef.current = null
    setLightboxOpen(false)
  }, [displayTaskId])

  useEffect(() => {
    setRedoOriginBusy(false)
    setRedoOriginError('')
    return () => redoOriginRequest.current?.abort()
  }, [displayTaskId])

  // 生成完成后刷新历史抽屉，新结果会立刻出现在记录里
  useEffect(() => {
    if (!isGenerating && generationTask) setRefreshKey((value) => value + 1)
  }, [generationTask?.id, generationTask?.status, isGenerating])

  function downloadCurrent() {
    if (!heroReady) return
    const prefix = displayTaskId?.slice(0, 8)
    downloadImage(heroImage, `istudio-${prefix ?? 'result'}-${safeIndex + 1}.png`)
  }

  function downloadImage(path: string, filename: string) {
    setDownloadError(null)
    void downloadProtectedAsset(path, filename).catch(() =>
      setDownloadError({ taskId: displayTaskId, message: '下载失败，请检查连接后重试' }),
    )
  }

  async function downloadGroup(id: string, title: string) {
    setDownloadError(null)
    setArchiveDownload(null)
    setDownloadGroupBusy(true)
    try {
      const token = getAccessToken()
      const response = await fetch(
        `${apiBaseUrl}/v1/generation/tasks/${encodeURIComponent(id)}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!response.ok) throw new Error(await readApiError(response, '图组下载失败'))
      const imageCount = Number(response.headers.get('X-Archive-Image-Count'))
      const expectedCount = Number(response.headers.get('X-Archive-Expected-Count'))
      if (
        !Number.isSafeInteger(imageCount) ||
        imageCount < 1 ||
        !Number.isSafeInteger(expectedCount) ||
        expectedCount < imageCount
      ) {
        throw new Error('无法确认 ZIP 的图片数量，请重试')
      }
      const archive = await response.blob()
      if (getAccessToken() !== token) throw new Error('账号已切换，请重新下载')
      const missing = expectedCount - imageCount
      const suffix = missing > 0 ? `-缺${missing}张` : ''
      const url = URL.createObjectURL(archive)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${title}${suffix}.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      setArchiveDownload({ taskId: id, imageCount, expectedCount })
    } catch (error) {
      setArchiveDownload({
        taskId: id,
        error: error instanceof Error ? error.message : '图组下载失败',
      })
    } finally {
      setDownloadGroupBusy(false)
    }
  }

  async function openRedoOrigin() {
    const id = redoInput?.redoSourceTaskId
    if (!id || redoOriginBusy) return
    redoOriginRequest.current?.abort()
    const controller = new AbortController()
    redoOriginRequest.current = controller
    setRedoOriginBusy(true)
    setRedoOriginError('')
    try {
      const { task: origin } = await frontendRequest<{ task: HistoryTask }>(
        `generation/tasks/${encodeURIComponent(id)}`,
        { signal: controller.signal },
        '原版读取失败，请重试',
      )
      if (controller.signal.aborted) return
      const originalIndex = Math.max(
        0,
        origin.resultImages?.findIndex(
          (path) => path === `/v1/assets/${redoInput.redoSourceAssetId}/content`,
        ) ?? 0,
      )
      if (origin.id === displayTaskId) setActiveImageIndex(originalIndex)
      else pendingImageRef.current = originalIndex
      onSelectHistory(origin)
    } catch (reason) {
      if (!controller.signal.aborted)
        setRedoOriginError(reason instanceof Error ? reason.message : '原版读取失败，请重试')
    } finally {
      if (!controller.signal.aborted) setRedoOriginBusy(false)
    }
  }

  function step(direction: -1 | 1) {
    const next = safeIndex + direction
    if (next < 0 || next >= images.length) return
    setActiveImageIndex(next)
  }

  const recentHistory =
    !isGenerating && resultHistory.length > 0 ? (
      <GenerationHistory
        placement="filmstrip"
        onViewAll={onToggleHistory}
        items={resultHistory}
        activeIndex={isHistoryView ? -1 : activeResultIndex}
        activeImageIndex={safeIndex}
        onSelect={(resultIndex, imageIndex) => {
          pendingImageRef.current = imageIndex
          if (isHistoryView) {
            onExitHistoryView()
            onSetActiveResultIndex(() => resultIndex)
            return
          }
          if (resultIndex === activeResultIndex) {
            setActiveImageIndex(imageIndex)
            pendingImageRef.current = null
            return
          }
          onSetActiveResultIndex(() => resultIndex)
        }}
        onDownload={downloadImage}
        onUseAsReference={(path) => onUseImageAsReference(path, { mode, taskType: task })}
      />
    ) : null

  return (
    <section className="creation-canvas result-workspace">
      <header className="result-head" ref={resultHeader} tabIndex={-1}>
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
                {isRegeneratingHistory ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw size={14} aria-hidden="true" />
                )}
                重新生成
              </button>
              <button type="button" className="meta-action" onClick={onExitHistoryView}>
                回到当前任务
              </button>
            </>
          ) : (
            <>
              {hasResults && !isGenerating && (
                <span className="meta-chip is-status">
                  <Check size={12} aria-hidden="true" />
                  {activeResult?.status === 'succeeded' ? '生成完成' : '部分完成'}
                </span>
              )}
              {isGenerating && (
                <span className="meta-chip is-status">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  {generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}
                </span>
              )}
              {/* 还没有任何结果时不显示「N 张 / 比例 / 分辨率」和「重新生成」：
                  此时没有可重新生成的对象，直接引导用户用左侧的生成按钮 */}
              {(hasResults || isGenerating) && (
                <>
                  <span className="meta-chip">{displayRatio}</span>
                  <span className="meta-chip">请求档位 {displayResolution}</span>
                  <button
                    type="button"
                    className="meta-action is-primary"
                    title="用当前左侧配置再生成一次"
                    disabled={isSubmitting || isGenerating}
                    onClick={onRegenerate}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    重新生成
                  </button>
                </>
              )}
            </>
          )}
          {redoInput?.redoSourceTaskId && (
            <button
              type="button"
              className="meta-action"
              onClick={() => void openRedoOrigin()}
              disabled={redoOriginBusy}
            >
              {redoOriginBusy ? '正在查看原版…' : '查看原版'}
            </button>
          )}
        </div>
      </header>

      {downloadError && downloadError.taskId === displayTaskId && (
        <p className="form-notice error" role="alert">
          {downloadError.message}
        </p>
      )}
      {redoOriginError && (
        <p className="form-notice error" role="alert">
          {redoOriginError}
        </p>
      )}

      <div className={`result-layout${recentHistory ? ' has-recent-history' : ''}`}>
        <div className="result-body">
          {isGenerating && !isHistoryView && !hasResults && (
            <div className="result-generating">
              <div className={`result-stage${generatingImages > 1 ? ' has-strip' : ''}`}>
                {/* 占位尺寸与生成后的主图一致：同比例、同最大高度 */}
                <ImageViewport aspectRatio={heroRatio} loading>
                  <GenerationLoading
                    status={generationTask?.status ?? 'processing'}
                    count={generationTotal}
                  />
                </ImageViewport>
                {generatingImages > 1 && (
                  <div className="result-strip-skeleton" aria-hidden="true">
                    {Array.from({ length: generatingImages }, (_, index) => (
                      <span key={index} className="generation-pending-thumbnail">
                        <span>{index + 1}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {isGenerating && !isHistoryView && hasResults && (
            <p className="form-notice" role="status" aria-live="polite" aria-atomic="true">
              已保存 {images.length} / {generationTotal} 张，可先查看和下载；其余图片仍在生成。
            </p>
          )}

          {!isGenerating && !hasResults && !isHistoryView && (
            <div className="result-empty">
              {failureMessage ? (
                <FailureNotice message={failureMessage} />
              ) : starter ? (
                starter
              ) : (
                <img
                  className="empty-creation-image"
                  src="/empty-creation.svg"
                  width={420}
                  height={280}
                  alt="暂无生成结果，黑白抽象画幅空态插画"
                  draggable={false}
                />
              )}
              {onConfigure && (
                <button type="button" className="studio-secondary" onClick={onConfigure}>
                  上传服装，开始规划
                </button>
              )}
            </div>
          )}

          {/* 历史查看态但这条记录没有产出图片（例如生成失败）：给出原因，而不是留白 */}
          {isHistoryView && !hasResults && !isGenerating && (
            <div className="result-empty">
              <span className="result-empty-icon">
                <AlertTriangle size={22} aria-hidden="true" />
              </span>
              <h2>
                {historyTask?.status === 'failed' ? '这条记录生成失败' : '这条记录还没有生成结果'}
              </h2>
              <p>
                {historyTask?.status === 'failed'
                  ? '失败原因如下，可以回到当前任务调整后重新生成。'
                  : '任务可能还在进行中，稍后刷新历史记录再看。'}
              </p>
              {historyTask?.errorMessage && <FailureNotice message={historyTask.errorMessage} />}
            </div>
          )}

          {failureMessage && hasResults && !isHistoryView && !isGenerating && (
            <FailureNotice message={failureMessage} compact />
          )}

          {heroImage !== '' && (
            <div className="result-result">
              <div className="result-image-toolbar" role="group" aria-label="图片查看操作">
                <span className="result-image-info" aria-live="polite">
                  <strong>
                    {visibleIndex + 1} / {images.length}
                  </strong>
                  {heroReady && (
                    <span>
                      实际 {visiblePreview.width} × {visiblePreview.height} px
                    </span>
                  )}
                  {heroReady && actualDetail?.elapsedMs != null && (
                    <span>生成耗时 {(actualDetail.elapsedMs / 1000).toFixed(1)} 秒</span>
                  )}
                </span>
                <div className="result-image-commands">
                  <button
                    type="button"
                    className="studio-secondary"
                    disabled={!heroReady}
                    onClick={downloadCurrent}
                  >
                    <Download size={15} aria-hidden="true" />
                    下载图片
                  </button>
                  {groupTitle && displayTaskId && (
                    <button
                      type="button"
                      className="studio-secondary"
                      disabled={downloadGroupBusy}
                      onClick={() => void downloadGroup(displayTaskId, groupTitle)}
                    >
                      <Download size={15} aria-hidden="true" />
                      {downloadGroupBusy ? '打包中…' : partialGroup ? '下载已完成图片' : '下载整套'}
                    </button>
                  )}
                  {redoCandidate && (
                    <button
                      type="button"
                      className="studio-secondary"
                      disabled={!heroReady || isGenerating || isSubmitting}
                      onClick={() => setRedoSelection(redoCandidate)}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      只重做这张
                    </button>
                  )}
                  <button
                    type="button"
                    className="studio-secondary"
                    disabled={!heroReady}
                    onClick={() => setLightboxOpen(true)}
                  >
                    <Maximize2 size={15} aria-hidden="true" />
                    全屏查看
                  </button>
                  <button
                    type="button"
                    className="studio-secondary"
                    disabled={!heroReady}
                    title={referenceTitle}
                    onClick={() => onUseImageAsReference(heroImage, imageSource)}
                  >
                    <ImageIcon size={15} aria-hidden="true" />
                    继续创作
                  </button>
                  <ImageComparisonButton
                    candidates={comparisonImages}
                    initialLeft={productOriginal?.path ?? heroImage}
                    initialRight={productOriginal ? heroImage : undefined}
                    disabled={!heroReady}
                  />
                </div>
                {groupTitle && (
                  <p
                    className={`form-notice result-archive-notice ${
                      archiveNotice ? (archiveWarning ? 'error' : 'success') : 'sr-only'
                    }`}
                    role={archiveError ? 'alert' : 'status'}
                  >
                    {archiveNotice && (
                      <>
                        {archiveWarning ? (
                          <AlertTriangle size={15} aria-hidden="true" />
                        ) : (
                          <Check size={15} aria-hidden="true" />
                        )}
                        <span>{archiveNotice}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className={`result-stage${images.length > 1 ? ' has-strip' : ''}`}>
                <div
                  className={`result-image-area${images.length > 1 ? ' has-navigation' : ''}`}
                  role="group"
                  aria-label="生成图片查看区域"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault()
                      step(event.key === 'ArrowLeft' ? -1 : 1)
                    }
                  }}
                >
                  <ImageViewport aspectRatio={imageRatio}>
                    {previews.length > 0 && (
                      <button
                        key={heroGroup}
                        type="button"
                        className="result-hero-open"
                        disabled={!heroReady}
                        aria-label={heroReady ? `放大查看第 ${safeIndex + 1} 张` : undefined}
                        title={heroReady ? '点击查看大图' : undefined}
                        onClick={() => setLightboxOpen(true)}
                      >
                        {previews.map((preview) => {
                          const show = preview === visiblePreview && !heroFailed
                          const selected =
                            preview.path === selectedPreview?.path &&
                            preview.source === selectedPreview.source
                          return (
                            <img
                              key={JSON.stringify([preview.path, preview.source])}
                              className={`result-hero-image${show ? '' : ' is-preloading'}`}
                              src={preview.source}
                              alt={show ? `AI 生成结果 ${visibleIndex + 1}` : ''}
                              onLoad={({ currentTarget: image }) => {
                                if (selected && image.naturalWidth > 0 && image.naturalHeight > 0)
                                  setLoadedPreview({
                                    ...preview,
                                    width: image.naturalWidth,
                                    height: image.naturalHeight,
                                  })
                              }}
                              onError={() => {
                                if (selected) setFailedPreview(preview)
                              }}
                            />
                          )
                        })}
                      </button>
                    )}
                    {!heroReady && (
                      <div
                        className={`result-hero-pending${visiblePreview && !heroFailed ? ' is-switching' : ''}`}
                        role={heroFailed ? 'alert' : 'status'}
                      >
                        <span>
                          {heroFailed
                            ? '图片加载失败'
                            : visiblePreview
                              ? '正在切换图片…'
                              : '正在加载图片…'}
                          {heroFailed && (
                            <button
                              type="button"
                              onClick={() => {
                                setFailedPreview(null)
                                retryHero()
                              }}
                              title="重新加载"
                              aria-label="重新加载结果图"
                            >
                              <RefreshCw size={16} aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </div>
                    )}

                    {heroReady && imageLabel && <span className="module-badge">{imageLabel}</span>}
                  </ImageViewport>
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="image-side-nav is-prev"
                        aria-label="上一张"
                        disabled={safeIndex === 0}
                        onClick={() => step(-1)}
                      >
                        <ChevronLeft size={20} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="image-side-nav is-next"
                        aria-label="下一张"
                        disabled={safeIndex === images.length - 1}
                        onClick={() => step(1)}
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </button>
                    </>
                  )}
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
            </div>
          )}
        </div>
        {recentHistory}
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
        onDownload={downloadImage}
        onUseAsReference={onUseImageAsReference}
        onLoadConfig={onLoadHistoryConfig}
        onRegenerate={onRegenerateFromHistory}
        onDelete={onDeleteHistoryTask}
      />

      {redoSelection && onRedoImage && (
        <RedoImageDialog
          modelId={redoSelection.modelId}
          imageLabel={redoSelection.label}
          busy={isGenerating || isSubmitting}
          onCancel={() => setRedoSelection(null)}
          onSubmit={async (requirements, quote) => {
            await onRedoImage(
              redoSelection.taskId,
              { assetId: redoSelection.assetId, requirements },
              quote,
            )
            setRedoSelection(null)
            onExitHistoryView()
            requestAnimationFrame(() => resultHeader.current?.focus())
          }}
        />
      )}

      {lightboxOpen && heroImage && (
        <ImageLightbox
          path={heroImage}
          alt={`${title}生成结果 ${safeIndex + 1}`}
          filename={`istudio-${displayTaskId?.slice(0, 8) ?? 'result'}-${safeIndex + 1}`}
          fullscreen
          hasPrev={images.length > 1 && safeIndex > 0}
          hasNext={images.length > 1 && safeIndex < images.length - 1}
          onPrev={images.length > 1 ? () => step(-1) : undefined}
          onNext={images.length > 1 ? () => step(1) : undefined}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </section>
  )
}
