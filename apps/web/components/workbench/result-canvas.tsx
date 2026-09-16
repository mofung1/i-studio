import { Box, Check, ChevronLeft, ChevronRight, Download, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { generationStatusLabels, type InlineGenerationTask } from './use-generation-task'
import { generalCanvasImage, taskMeta } from './shared'
import type { CommerceTaskType } from '@/lib/contracts'
import type { WorkbenchMode } from './shared'

interface ResultCanvasProps {
  mode: WorkbenchMode
  task: CommerceTaskType
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

export function ResultCanvas({
  mode, task, resultHistory, activeResultIndex, activeResult,
  generationTask, isGenerating, isSubmitting, aiEnabled,
  onSetActiveResultIndex, onSetReferenceFiles, onRegenerate,
}: ResultCanvasProps) {
  const currentTask = taskMeta[task]
  const canvasImage = mode === 'general' ? generalCanvasImage : currentTask.image
  const title = mode === 'general' ? '通用生图' : currentTask.title
  const description = mode === 'general' ? '用文字描述或参考图片构建画面' : currentTask.description

  return (
    <section className={`creation-canvas ${(resultHistory.length > 0 || isGenerating) ? 'has-generation-result' : ''}`}>
      {resultHistory.length === 0 && !isGenerating && <>
        <div className="canvas-copy"><span>{mode === 'general' ? 'AI 图片' : '电商工具'}</span><h1>{title}</h1><p>{description}</p></div>
        <div className="canvas-preview">
          <img src={canvasImage} alt={`${title}效果预览`} />
          <span>效果预览</span>
        </div>
        <p className="integration-note"><Box size={16} />当前展示设计参考图；尚未调用 AI，也不会产生费用。</p>
      </>}

      {isGenerating && <div className="generation-feedback">
        <span className="generation-status-icon"><Sparkles size={22} /></span>
        <h2>{generationStatusLabels[generationTask?.status ?? ''] ?? '任务处理中'}</h2>
        <p>结果返回后会自动显示在当前页面。</p>
        <div className="generation-progress" aria-label="任务处理中"><span /></div>
      </div>}

      {!isGenerating && generationTask && generationTask.status !== 'succeeded' && resultHistory.length === 0 && (
        <div className="inline-generation-error"><strong>生成失败</strong><span>{generationTask.errorMessage || '供应商未返回错误详情，请重试。'}</span></div>
      )}

      {resultHistory.length > 0 && !isGenerating && activeResult && activeResult.resultImages?.length ? (
        <div className="editor-result">
          {resultHistory.length > 1 && (
            <div className="result-history-nav" role="navigation" aria-label="历史生成结果">
              <button
                type="button"
                aria-label="上一次结果"
                disabled={activeResultIndex === 0}
                onClick={() => onSetActiveResultIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft size={15} />
              </button>
              <span>第 {activeResultIndex + 1} / {resultHistory.length} 次</span>
              <button
                type="button"
                aria-label="下一次结果"
                disabled={activeResultIndex === resultHistory.length - 1}
                onClick={() => onSetActiveResultIndex((i) => Math.min(resultHistory.length - 1, i + 1))}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          <div className="result-topline">
            <div><span className="success-label"><Check size={13} />生成完成</span><h2>{title}</h2></div>
            <span>{activeResult.resultImages.length} 张图片</span>
          </div>

          <div className="inline-result-grid">
            {activeResult.resultImages.map((path, index) => (
              <div className="inline-result-image" key={path}>
                <AuthenticatedImage path={path} alt={`AI 生成结果 ${index + 1}`} />
                <span className="ai-badge">AI 生成</span>
                <div className="result-image-actions">
                  <button
                    type="button"
                    aria-label={`下载第 ${index + 1} 张图片`}
                    title="下载"
                    onClick={() => void downloadProtectedAsset(path, `istudio-${activeResult.id.slice(0, 8)}-${index + 1}.png`)}
                  >
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`以第 ${index + 1} 张图片为参考再生成`}
                    title="以此图为参考再生成"
                    onClick={async () => {
                      // 将已生成图片下载为 Blob，转换为 File，填入 referenceFiles
                      const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
                      const token = getAccessToken()
                      const resp = await fetch(url, {
                        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                      })
                      if (!resp.ok) return
                      const blob = await resp.blob()
                      const filename = `ref-${activeResult.id.slice(0, 8)}-${index + 1}.png`
                      const file = new File([blob], filename, { type: blob.type || 'image/png' })
                      onSetReferenceFiles((prev) => [...prev, file].slice(0, 6))
                      // 滚动配置面板至顶部（让用户看到参考图已填入）
                      document.querySelector('.configuration-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="result-action-bar">
            <button
              type="button"
              className="result-action-btn"
              disabled={isSubmitting || isGenerating || aiEnabled === null}
              onClick={onRegenerate}
            >
              <RefreshCw size={14} />修改参数重新生成
            </button>
            <p className="integration-note" style={{ margin: 0 }}>
              <RefreshCw size={14} />结果已保存到任务记录
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
