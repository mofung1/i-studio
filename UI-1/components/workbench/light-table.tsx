'use client'

import {
  AlertCircle,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
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
import type { CommerceTaskType } from '@/lib/contracts'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { generalCanvasImage, moduleLabel, taskMeta, type WorkbenchMode } from './shared'
import { generationStatusLabels, type InlineGenerationTask } from './use-generation-task'

interface LightTableProps {
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

/** 把比例和分辨率换算成真实像素读数，让工单上的规格是可核对的。 */
function pixelSize(aspectRatio: string, resolution: string) {
  const base = resolution === '1K' ? 1024 : resolution === '4K' ? 4096 : 2048
  const [width, height] = aspectRatio.split(':').map(Number)
  if (!width || !height) return `${base}×${base}`
  const scale = base / Math.max(width, height)
  return `${Math.round(width * scale)}×${Math.round(height * scale)}`
}

export function LightTable({
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
}: LightTableProps) {
  const [zoom, setZoom] = useState(100)
  const [previewOnly, setPreviewOnly] = useState(false)
  const currentTask = taskMeta[task]
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const referenceImage = mode === 'general' ? generalCanvasImage : currentTask.image
  const hasResults = resultHistory.length > 0 && Boolean(activeResult?.resultImages?.length)
  const partialFailure =
    !isGenerating && generationTask && generationTask.status !== 'succeeded' ? generationTask : null

  return (
    <section
      className={`light-table${previewOnly ? ' preview-only' : ''}`}
      style={{ '--canvas-zoom': zoom / 100 } as CSSProperties}
      aria-label="画布"
    >
      <div className="table-bar">
        <div className="table-bar-left">
          <span className="table-readout">
            <b>{aspectRatio}</b>
            <span className="readout-sep" aria-hidden="true" />
            <span>{resolution}</span>
            <span className="readout-sep" aria-hidden="true" />
            <span>{pixelSize(aspectRatio, resolution)}</span>
          </span>
          {resultHistory.length > 0 && (
            <>
              <span className="readout-sep" aria-hidden="true" />
              <span className="table-readout">
                已出 {resultHistory.reduce((total, item) => total + (item.resultImages?.length ?? 0), 0)} 张
              </span>
            </>
          )}
        </div>
        <div className="table-bar-right">
          <div className="tool-cluster" role="group" aria-label="缩放">
            <button type="button" aria-label="缩小" title="缩小" disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 10))}>
              <ZoomOut size={15} />
            </button>
            <button type="button" aria-label="重置缩放" title="重置为 100%" onClick={() => setZoom(100)}>
              {zoom}%
            </button>
            <button type="button" aria-label="放大" title="放大" disabled={zoom >= 150} onClick={() => setZoom((value) => Math.min(150, value + 10))}>
              <ZoomIn size={15} />
            </button>
            <button type="button" aria-label="适应画布" title="适应画布" onClick={() => setZoom(100)}>
              <Maximize2 size={15} />
            </button>
          </div>
          <div className="tool-cluster" role="group" aria-label="预览">
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

      <div className="table-stage">
        {isGenerating ? (
          <div className="developing">
            <span className="developing-icon">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <h3>{generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}</h3>
            <p>结果返回后会自动出现在这张台面上。</p>
            <div className="develop-bar" role="progressbar" aria-label="生成中">
              <span />
            </div>
          </div>
        ) : hasResults && activeResult ? (
          <div className="result-sheet">
            <div className="result-head">
              <div>
                <span className={`stamp${activeResult.status === 'succeeded' ? '' : ''}`} data-kind={activeResult.status === 'succeeded' ? undefined : 'partial'}>
                  <Check size={12} aria-hidden="true" />
                  {activeResult.status === 'succeeded' ? '已完成' : '部分完成'}
                </span>
                <h2>{title}</h2>
              </div>
              <div className="table-bar-right">
                {resultHistory.length > 1 && (
                  <div className="tool-cluster" role="group" aria-label="历史结果">
                    <button
                      type="button"
                      aria-label="上一批结果"
                      disabled={activeResultIndex === 0}
                      onClick={() => onSetActiveResultIndex((index) => Math.max(0, index - 1))}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="table-readout" style={{ padding: '0 6px' }}>
                      {activeResultIndex + 1} / {resultHistory.length}
                    </span>
                    <button
                      type="button"
                      aria-label="下一批结果"
                      disabled={activeResultIndex === resultHistory.length - 1}
                      onClick={() => onSetActiveResultIndex((index) => Math.min(resultHistory.length - 1, index + 1))}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
                <span className="result-head-meta">{activeResult.resultImages?.length ?? 0} 张</span>
              </div>
            </div>

            <div className="result-grid" style={{ '--cell-ratio': aspectRatio.replace(':', ' / ') } as CSSProperties}>
              {activeResult.resultImages?.map((path, index) => {
                const label = moduleLabel(task, activeResult.resultModules?.[index] ?? '')
                return (
                  <figure className="result-cell" key={path}>
                    <span className="reg reg-tl" aria-hidden="true" />
                    <span className="reg reg-tr" aria-hidden="true" />
                    <span className="reg reg-bl" aria-hidden="true" />
                    <span className="reg reg-br" aria-hidden="true" />
                    <AuthenticatedImage path={path} alt={`生成结果第 ${index + 1} 张`} />
                    <figcaption className="cell-flags">
                      <span className="flag flag-ai">AI 生成</span>
                      {label && <span className="flag flag-module">{label}</span>}
                    </figcaption>
                    <div className="cell-tools">
                      <button
                        type="button"
                        title="下载"
                        aria-label={`下载第 ${index + 1} 张`}
                        onClick={() =>
                          void downloadProtectedAsset(path, `istudio-${activeResult.id.slice(0, 8)}-${index + 1}.png`)
                        }
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        title="以此为参考再生成"
                        aria-label={`以第 ${index + 1} 张为参考再生成`}
                        onClick={async () => {
                          const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
                          const token = getAccessToken()
                          const response = await fetch(url, {
                            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                          })
                          if (!response.ok) return
                          const blob = await response.blob()
                          const file = new File([blob], `ref-${activeResult.id.slice(0, 8)}-${index + 1}.png`, {
                            type: blob.type || 'image/png',
                          })
                          onSetReferenceFiles((previous) => [...previous, file].slice(0, 6))
                          document.querySelector('.spec-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        <RotateCcw size={15} />
                      </button>
                    </div>
                  </figure>
                )
              })}
            </div>

            {partialFailure && (
              <p className="slip" role="alert">
                <AlertCircle size={14} aria-hidden="true" />
                <span>
                  <strong>部分生成失败</strong>
                  {partialFailure.errorMessage || '供应商没有返回错误详情，可以调整参数后重试。'}
                </span>
              </p>
            )}

            <div className="result-head">
              <button
                className="btn btn-outline"
                type="button"
                disabled={isSubmitting || isGenerating || aiEnabled === null}
                onClick={onRegenerate}
              >
                <RefreshCw size={14} aria-hidden="true" />
                按当前工单重新生成
              </button>
              <span className="result-head-meta">结果已存入任务记录</span>
            </div>
          </div>
        ) : (
          <>
            <div className="table-copy">
              <h2>{title}</h2>
              <p>{mode === 'general' ? '用一句话或一张参考图，构建你想要的画面。' : currentTask.description}</p>
            </div>
            <div className="table-frame">
              <span className="reg reg-tl" aria-hidden="true" />
              <span className="reg reg-tr" aria-hidden="true" />
              <span className="reg reg-bl" aria-hidden="true" />
              <span className="reg reg-br" aria-hidden="true" />
              <div className="frame-plate">
                <img src={referenceImage} alt={`${title}设计参考样张`} />
              </div>
            </div>
            <p className="frame-note">
              <Box size={14} aria-hidden="true" />
              这是设计参考样张，不是生成结果 —— 提交前不会调用 AI，也不产生费用。
            </p>
            {partialFailure && (
              <p className="slip" role="alert">
                <AlertCircle size={14} aria-hidden="true" />
                <span>
                  <strong>生成失败</strong>
                  {partialFailure.errorMessage || '供应商没有返回错误详情，可以调整参数后重试。'}
                </span>
              </p>
            )}
          </>
        )}
      </div>

      {resultHistory.length > 1 && !previewOnly && (
        <div className="contact-sheet" aria-label="历史结果联系表">
          <div className="contact-label">
            <strong>联系表</strong>
            <span>{resultHistory.length} 批</span>
          </div>
          <div className="contact-strip" role="list">
            {resultHistory.map((item, index) => (
              <button
                className="contact-frame"
                key={item.id}
                type="button"
                role="listitem"
                aria-current={index === activeResultIndex}
                aria-label={`查看第 ${index + 1} 批结果，共 ${item.resultImages?.length ?? 0} 张`}
                onClick={() => onSetActiveResultIndex(() => index)}
              >
                <AuthenticatedImage path={item.resultImages?.[0] ?? ''} alt={`第 ${index + 1} 批结果缩览`} />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
