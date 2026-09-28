'use client'

import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useState, type CSSProperties } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { Button } from '@/components/ui'
import type { CommerceTaskType } from '@/lib/contracts'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { generalCanvasImage, moduleLabel, pixelSize, taskMeta, type WorkbenchMode } from './shared'
import type { InlineGenerationTask } from './use-generation-task'

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
  onUseStarter: (prompt: string) => void
  onSetActiveResultIndex: (updater: (index: number) => number) => void
  onSetReferenceFiles: (updater: (files: File[]) => File[]) => void
  onRegenerate: () => void
}

const stepNames = ['已提交', '排队中', '生成中', '完成']

/** 空态给三个能直接用的起点，点一下填进描述框 */
const starters = {
  general: [
    { tone: 'mint', label: '极简白底棚拍', prompt: '纯白无缝背景，柔和棚拍光，商品居中，突出材质与真实细节，画面干净。' },
    { tone: 'lime', label: '自然生活场景', prompt: '自然光下的生活场景，浅景深暖色调，商品置于画面黄金分割点，背景克制不抢主体。' },
    { tone: 'peach', label: '高端质感特写', prompt: '深色背景的质感特写，戏剧性侧光，强调表面纹理与工艺细节，适合高端投放。' },
  ],
  commerce: [
    { tone: 'mint', label: '突出核心卖点', prompt: '突出产品名称与核心卖点，构图干净、主体明确，第一眼就能抓住注意力。' },
    { tone: 'lime', label: '强调材质工艺', prompt: '强调材质与工艺细节，干净的背景与柔和光影，整体呈现高级真实的质感。' },
    { tone: 'peach', label: '加入使用场景', prompt: '加入目标人群的使用场景，画面有生活气息，同时保证商品是视觉中心。' },
  ],
} as const

/** 任务状态 → 当前进行到第几步（4 表示全部走完）。 */
function stageOf(status: string | undefined, hasResults: boolean) {
  if (!status) return 1
  if (status === 'succeeded') return 4
  if (status === 'queued') return 1
  if (hasResults) return 3
  return 2
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
  onUseStarter,
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
  const stage = stageOf(generationTask?.status, hasResults)

  return (
    <div className="stage">
      <section
        className={`cv${previewOnly ? ' is-preview' : ''}`}
        style={{ '--cv-zoom': zoom / 100 } as CSSProperties}
        aria-label="生成画布"
      >
        {previewOnly && (
          <button className="preview-exit" type="button" onClick={() => setPreviewOnly(false)}>
            <X size={15} />
            退出预览
          </button>
        )}

        {/* 右浮工具坞：参考图右下角那排竖向圆形按钮 */}
        <div className="cv-dock" role="group" aria-label="画布工具">
          <button type="button" aria-label="缩小" title="缩小" disabled={zoom <= 50} onClick={() => setZoom((value) => Math.max(50, value - 10))}>
            <ZoomOut size={15} />
          </button>
          <button type="button" aria-label="重置缩放" title="重置为 100%" onClick={() => setZoom(100)}>
            {zoom}%
          </button>
          <button type="button" aria-label="放大" title="放大" disabled={zoom >= 150} onClick={() => setZoom((value) => Math.min(150, value + 10))}>
            <ZoomIn size={15} />
          </button>
          <span className="cv-dock-sep" aria-hidden="true" />
          <button type="button" aria-label="适应画布" title="适应画布" onClick={() => setZoom(100)}>
            <Maximize2 size={15} />
          </button>
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

        <div className="cv-body">
          {isGenerating ? (
            <div className="cv-working">
              <div className="stepper" role="group" aria-label="生成进度">
                {stepNames.map((name, index) => {
                  const state = index < stage - 1 ? 'is-done' : index === stage - 1 ? 'is-active' : ''
                  return (
                    <div className={`step ${state}`} key={name}>
                      <span className="step-node" aria-hidden="true" />
                      <span className="step-label">{name}</span>
                    </div>
                  )
                })}
              </div>
              <h3>正在生成 {currentTask.title}</h3>
              <p>结果返回后会自动出现在这块画布上，可以先去做别的事。</p>
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
                </div>
                <div className="chips">
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
                      <button
                        className="is-wide"
                        type="button"
                        aria-label="跳到最新一批"
                        onClick={() => onSetActiveResultIndex(() => resultHistory.length - 1)}
                      >
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
                <p className="toast toast-warn" role="alert">
                  <AlertCircle size={14} aria-hidden="true" />
                  <span>
                    <strong>部分生成失败　</strong>
                    {failure.errorMessage || '供应商没有返回错误详情，可以调整参数后重试。'}
                  </span>
                </p>
              )}

              <div className="cv-actions">
                <Button
                  variant="outline"
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
                <h3>还没有出图</h3>
                <p>
                  {mode === 'general'
                    ? '填好左侧工单后点「生成 通用生图」，结果会出现在这块画布上。'
                    : `填好左侧工单后点「生成 ${currentTask.title}」，结果会出现在这块画布上。`}
                </p>
              </div>
              <div className="starter" aria-label="起步示例">
                {starters[mode].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    data-tone={item.tone}
                    title="点击填入生成描述"
                    onClick={() => onUseStarter(item.prompt)}
                  >
                    <Wand2 size={13} aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="cv-frame">
                <span className="cv-tag">参考样张</span>
                <img src={referenceImage} alt={`${title}效果参考`} />
              </div>
              <p className="cv-note">
                <Eye size={13} aria-hidden="true" />
                这是设计参考图，不是生成结果 —— 提交前不会调用 AI，也不产生费用
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
