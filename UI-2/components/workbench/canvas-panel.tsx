'use client'

import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useState, type CSSProperties } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { Button } from '@/components/ui'
import type { CommerceTaskType } from '@/lib/contracts'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { generalCanvasImage, moduleLabel, taskMeta, type WorkbenchMode } from './shared'
import { generationStatusLabels, type InlineGenerationTask } from './use-generation-task'

interface CanvasPanelProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  aspectRatio: string
  resolution: string
  resultHistory: InlineGenerationTask[]
  activeResultIndex: number
  activeResult: InlineGenerationTask | null
  generationTask: InlineGenerationTask | null
  isGenerating: boolean
  isSubmitting: boolean
  aiEnabled: boolean | null
  onSetActiveResultIndex: (updater: (index: number) => number) => void
  onSetReferenceFiles: (updater: (files: File[]) => File[]) => void
  onRegenerate: () => void
}

/** 把比例和分辨率换算成真实像素读数，让规格是可核对的。 */
function pixelSize(aspectRatio: string, resolution: string) {
  const base = resolution === '1K' ? 1024 : resolution === '4K' ? 4096 : 2048
  const [width, height] = aspectRatio.split(':').map(Number)
  if (!width || !height) return `${base}×${base}`
  const scale = base / Math.max(width, height)
  return `${Math.round(width * scale)}×${Math.round(height * scale)}`
}

export function CanvasPanel({
  mode,
  task,
  aspectRatio,
  resolution,
  resultHistory,
  activeResultIndex,
  activeResult,
  generationTask,
  isGenerating,
  isSubmitting,
  aiEnabled,
  onSetActiveResultIndex,
  onSetReferenceFiles,
  onRegenerate,
}: CanvasPanelProps) {
  const [zoom, setZoom] = useState(100)
  const [previewOnly, setPreviewOnly] = useState(false)
  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const referenceImage = mode === 'general' ? generalCanvasImage : currentTask.image
  const hasResults = resultHistory.length > 0 && Boolean(activeResult?.resultImages?.length)
  const failure = !isGenerating && generationTask && generationTask.status !== 'succeeded' ? generationTask : null
  const totalImages = resultHistory.reduce((total, item) => total + (item.resultImages?.length ?? 0), 0)

  return (
    <div className="stage">
      <section
        className={`cv${previewOnly ? ' is-preview' : ''}`}
        style={{ '--cv-zoom': zoom / 100 } as CSSProperties}
        aria-label="生成画布"
      >
        <div className="cv-bar">
          <div className="cv-bar-left">
            <span className="chip num">{aspectRatio}</span>
            <span className="chip num">{resolution}</span>
            <span className="cv-readout">{pixelSize(aspectRatio, resolution)}</span>
            {totalImages > 0 && <span className="chip is-primary num">已出 {totalImages} 张</span>}
          </div>
          <div className="cv-bar-right">
            <div className="ico-group" role="group" aria-label="缩放">
              <button type="button" aria-label="缩小" title="缩小" disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 10))}>
                <ZoomOut size={15} />
              </button>
              <button className="is-wide" type="button" aria-label="重置缩放" title="重置为 100%" onClick={() => setZoom(100)}>
                {zoom}%
              </button>
              <button type="button" aria-label="放大" title="放大" disabled={zoom >= 150} onClick={() => setZoom((value) => Math.min(150, value + 10))}>
                <ZoomIn size={15} />
              </button>
              <button type="button" aria-label="适应画布" title="适应画布" onClick={() => setZoom(100)}>
                <Maximize2 size={15} />
              </button>
            </div>
            <div className="ico-group" role="group" aria-label="预览">
              <button
                type="button"
                aria-label={previewOnly ? '退出纯预览' : '纯预览'}
                title={previewOnly ? '退出纯预览' : '纯预览'}
                aria-pressed={previewOnly}
                onClick={() => setPreviewOnly((value) => !value)}
              >
                <Eye size={15} />
              </button>
            </div>
          </div>
        </div>

        {previewOnly && (
          <button className="preview-exit" type="button" onClick={() => setPreviewOnly(false)}>
            <X size={15} />
            退出预览
          </button>
        )}

        <div className="cv-stage">
          {isGenerating ? (
            <div className="cv-working">
              <span className="cv-working-icon">
                <Sparkles size={26} aria-hidden="true" />
              </span>
              <h3>{generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}</h3>
              <p>结果返回后会自动出现在这里，可以先去做别的事。</p>
              <div className="cv-progress" role="progressbar" aria-label="生成中">
                <span />
              </div>
            </div>
          ) : hasResults && activeResult ? (
            <div className="cv-results">
              <div className="cv-res-head">
                <div>
                  <span className="stamp" data-kind={activeResult.status === 'succeeded' ? undefined : 'partial'}>
                    <Check size={12} aria-hidden="true" />
                    {activeResult.status === 'succeeded' ? '生成完成' : '部分完成'}
                  </span>
                  <h2>{title}</h2>
                </div>
                <div className="cv-bar-right">
                  {resultHistory.length > 1 && (
                    <div className="ico-group" role="group" aria-label="历史批次">
                      <button
                        type="button"
                        aria-label="上一批"
                        disabled={activeResultIndex === 0}
                        onClick={() => onSetActiveResultIndex((index) => Math.max(0, index - 1))}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button className="is-wide" type="button" aria-label="重置到最新" onClick={() => onSetActiveResultIndex(() => resultHistory.length - 1)}>
                        {activeResultIndex + 1}/{resultHistory.length}
                      </button>
                      <button
                        type="button"
                        aria-label="下一批"
                        disabled={activeResultIndex === resultHistory.length - 1}
                        onClick={() => onSetActiveResultIndex((index) => Math.min(resultHistory.length - 1, index + 1))}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                  <span className="cv-count">{activeResult.resultImages?.length ?? 0} 张</span>
                </div>
              </div>

              <div className="cv-grid" style={{ '--tile-ratio': aspectRatio.replace(':', ' / ') } as CSSProperties}>
                {activeResult.resultImages?.map((path, index) => {
                  const label = moduleLabel(task, activeResult.resultModules?.[index] ?? '')
                  return (
                    <figure className="cv-tile" key={path}>
                      <AuthenticatedImage path={path} alt={`生成结果第 ${index + 1} 张`} />
                      <figcaption className="cv-badges">
                        <span className="cv-badge is-ai">AI 生成</span>
                        {label && <span className="cv-badge is-module">{label}</span>}
                      </figcaption>
                      <div className="cv-tools">
                        <button
                          type="button"
                          title="下载"
                          aria-label={`下载第 ${index + 1} 张`}
                          onClick={() => void downloadProtectedAsset(path, `istudio-${activeResult.id.slice(0, 8)}-${index + 1}.png`)}
                        >
                          <Download size={15} />
                        </button>
                        <button
                          type="button"
                          title="以这张为参考再生成"
                          aria-label={`以第 ${index + 1} 张为参考再生成`}
                          onClick={async () => {
                            const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
                            const token = getAccessToken()
                            const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
                            if (!response.ok) return
                            const blob = await response.blob()
                            const file = new File([blob], `ref-${activeResult.id.slice(0, 8)}-${index + 1}.png`, {
                              type: blob.type || 'image/png',
                            })
                            onSetReferenceFiles((previous) => [...previous, file].slice(0, 6))
                            document.querySelector('.setup')?.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                        >
                          <RotateCcw size={15} />
                        </button>
                      </div>
                    </figure>
                  )
                })}
              </div>

              {failure && (
                <p className="toast toast-error" role="alert">
                  <AlertCircle size={14} aria-hidden="true" />
                  <span>
                    <strong>部分生成失败　</strong>
                    {failure.errorMessage || '供应商没有返回错误详情，可以调整参数后重试。'}
                  </span>
                </p>
              )}

              <div className="cv-actions">
                <Button
                  variant="white"
                  type="button"
                  disabled={isSubmitting || isGenerating || aiEnabled === null}
                  onClick={onRegenerate}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  按当前设置重新生成
                </Button>
                <span className="cv-count">结果已存入任务记录</span>
              </div>
            </div>
          ) : (
            <>
              <div className="cv-empty">
                <h2>{title}</h2>
                <p>{mode === 'general' ? '用一句话或一张参考图，构建你想要的画面。' : currentTask.description}</p>
              </div>
              <div className="cv-frame">
                <img src={referenceImage} alt={`${title}效果参考`} />
              </div>
              <p className="cv-note">
                <ImageIcon size={14} aria-hidden="true" />
                这是设计参考图，不是生成结果 —— 提交前不会调用 AI，也不产生费用。
              </p>
              {failure && (
                <p className="toast toast-error" role="alert">
                  <AlertCircle size={14} aria-hidden="true" />
                  <span>
                    <strong>生成失败　</strong>
                    {failure.errorMessage || '供应商没有返回错误详情，可以调整参数后重试。'}
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {resultHistory.length > 1 && !previewOnly && (
        <div className="history" aria-label="历史生成批次">
          <div className="history-label">
            <strong>历史</strong>
            <span>{resultHistory.length} 批</span>
          </div>
          <div className="history-strip" role="list">
            {resultHistory.map((item, index) => (
              <button
                className="history-thumb"
                key={item.id}
                type="button"
                role="listitem"
                aria-current={index === activeResultIndex}
                aria-label={`查看第 ${index + 1} 批，共 ${item.resultImages?.length ?? 0} 张`}
                onClick={() => onSetActiveResultIndex(() => index)}
              >
                <AuthenticatedImage path={item.resultImages?.[0] ?? ''} alt={`第 ${index + 1} 批缩览`} />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
