'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Delete,
  Download,
  Image as ImageIcon,
  Link2,
  Loader2,
  Pin,
  Type,
  Video,
  Wand2,
} from 'lucide-react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { completeText, deleteGeneratedAsset } from '@/lib/api'
import type { GeneralGenerationInput } from '@/lib/contracts'
import type { PublicImageModel } from '@/lib/generation-models'
import {
  assetIdFromContentPath,
  canvasNodeDefaults,
  imageNodeData,
  imageNodeResult,
  resolveReferenceImages,
  textNodeData,
  type CanvasNode,
  type CanvasTextNodeResult,
} from '@/lib/canvas'
import { useCanvasImageGeneration } from './use-canvas-generation'

const activeStatuses = new Set(['queued', 'processing', 'waiting_provider'])

interface CanvasNodeCardProps {
  node: CanvasNode
  selected: boolean
  imageEndpoints: PublicImageModel[]
  promptEnhanceEnabled: boolean
  /** 上游注入的参考图（图生图 / 图生文）资产 ID，按连线顺序展开 */
  referenceImages: string[]
  /** 上游注入的参考文本 */
  referenceTexts: string[]
  onPointerDown: (event: React.PointerEvent) => void
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
  onBeforeGenerate: () => void
  onUpdate: (patch: Partial<CanvasNode>) => void
  onSize: (id: string, width: number, height: number) => void
}

export function CanvasNodeCard({
  node,
  selected,
  imageEndpoints,
  promptEnhanceEnabled,
  referenceImages,
  referenceTexts,
  onPointerDown,
  onSelect,
  onDelete,
  onDuplicate,
  onBeforeGenerate,
  onUpdate,
  onSize,
}: CanvasNodeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const label = canvasNodeDefaults[node.type].label
  const Icon = node.type === 'text' ? Type : node.type === 'image' ? ImageIcon : Video

  // 节点高度随内容变化（结果图、文本），用实测尺寸定位端口与连线。
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) onSize(node.id, entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(el)
    onSize(node.id, el.offsetWidth, el.offsetHeight)
    return () => observer.disconnect()
  }, [node.id, onSize])

  return (
    <div
      ref={cardRef}
      className={`canvas-node is-${node.type}${selected ? ' is-selected' : ''}`}
      style={{ left: node.x, top: node.y, width: node.w, minHeight: node.h }}
      onPointerDown={onPointerDown}
      onFocus={onSelect}
      role="group"
      aria-label={`${label}节点`}
      tabIndex={0}
    >
      <div className="canvas-node-head">
        <span className="canvas-node-type">
          <Icon size={13} aria-hidden="true" />
          {label}
        </span>
        <div className="canvas-node-actions">
          <button
            type="button"
            className="canvas-node-duplicate"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onDuplicate()
            }}
            aria-label={`复制${label}节点`}
            title="复制节点"
          >
            <Copy size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="canvas-node-delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            aria-label={`删除${label}节点`}
            title="删除节点"
          >
            <Delete size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="canvas-node-body">
        {node.type === 'text' ? (
          <TextNodeBody
            node={node}
            promptEnhanceEnabled={promptEnhanceEnabled}
            referenceImages={referenceImages}
            referenceTexts={referenceTexts}
            onBeforeGenerate={onBeforeGenerate}
            onUpdate={onUpdate}
          />
        ) : node.type === 'image' ? (
          <ImageNodeBody
            node={node}
            imageEndpoints={imageEndpoints}
            referenceImages={referenceImages}
            referenceTexts={referenceTexts}
            onBeforeGenerate={onBeforeGenerate}
            onUpdate={onUpdate}
          />
        ) : (
          <p className="canvas-node-placeholder">视频节点 · 预留类型</p>
        )}
      </div>
    </div>
  )
}

function stopPointer(event: React.PointerEvent) {
  event.stopPropagation()
}

function TextNodeBody({
  node,
  promptEnhanceEnabled,
  referenceImages,
  referenceTexts,
  onBeforeGenerate,
  onUpdate,
}: {
  node: CanvasNode
  promptEnhanceEnabled: boolean
  referenceImages: string[]
  referenceTexts: string[]
  onBeforeGenerate: () => void
  onUpdate: (patch: Partial<CanvasNode>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = textNodeData(node)
  const result = node.result as CanvasTextNodeResult | null

  // 上游文本作为上下文拼在输入之后；本节点自己的文本为空时也能用上游结果生成。
  const effectiveText = [data.prompt, ...referenceTexts]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n')

  const run = async () => {
    if (!effectiveText && referenceImages.length === 0) {
      setError('请先输入文本或接入上游节点')
      return
    }
    onBeforeGenerate()
    setBusy(true)
    setError('')
    try {
      const res = await completeText({
        text: effectiveText,
        instruction: data.instruction.trim(),
        imageAssetIds: referenceImages.slice(0, 4),
      })
      onUpdate({ result: { text: res.text, model: res.model } })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="canvas-node-form">
      <textarea
        className="canvas-node-textarea"
        value={data.prompt}
        rows={3}
        placeholder="输入要处理的文本，或直接引用上游图片做图生文"
        aria-label="文本内容"
        onPointerDown={stopPointer}
        onChange={(event) => onUpdate({ data: { prompt: event.target.value } })}
      />
      {(referenceTexts.length > 0 || referenceImages.length > 0) && (
        <p className="canvas-node-ref-hint">
          <Link2 size={12} aria-hidden="true" />
          {referenceTexts.length > 0 && ` 上游文本 ×${referenceTexts.length}`}
          {referenceImages.length > 0 && ` 参考图 ×${Math.min(referenceImages.length, 4)}`}
        </p>
      )}
      <input
        className="canvas-node-instruction"
        value={data.instruction}
        placeholder="任务说明（可选，如：描述这张图）"
        aria-label="任务说明"
        onPointerDown={stopPointer}
        onChange={(event) => onUpdate({ data: { instruction: event.target.value } })}
      />
      <div className="canvas-node-controls">
        <button
          type="button"
          className="canvas-node-generate"
          disabled={busy || !promptEnhanceEnabled}
          title={promptEnhanceEnabled ? undefined : '未配置 AI 文本能力'}
          onPointerDown={stopPointer}
          onClick={run}
        >
          {busy ? (
            <Loader2 size={14} className="is-spinning" aria-hidden="true" />
          ) : (
            <Wand2 size={14} aria-hidden="true" />
          )}
          {busy ? '生成中…' : '生成'}
        </button>
      </div>
      {error && (
        <p className="canvas-node-error" role="alert">
          {error}
        </p>
      )}
      {result?.text && (
        <div className="canvas-node-text-result">
          <p>{result.text}</p>
          {result.model && <small>模型：{result.model}</small>}
        </div>
      )}
    </div>
  )
}

function ImageNodeBody({
  node,
  imageEndpoints,
  referenceImages,
  referenceTexts,
  onBeforeGenerate,
  onUpdate,
}: {
  node: CanvasNode
  imageEndpoints: PublicImageModel[]
  referenceImages: string[]
  referenceTexts: string[]
  onBeforeGenerate: () => void
  onUpdate: (patch: Partial<CanvasNode>) => void
}) {
  const data = imageNodeData(node)
  const result = imageNodeResult(node)
  const endpointId = data.endpointId || imageEndpoints[0]?.id || ''
  const endpoint = imageEndpoints.find((item) => item.id === endpointId)
  const active = result ? activeStatuses.has(result.status) : false

  const { generate, isSubmitting, isGenerating, notice } = useCanvasImageGeneration({
    initialTaskId: active && result?.taskId ? result.taskId : null,
    onResult: (next) => onUpdate({ result: next as unknown as Record<string, unknown> }),
  })

  const busy = isSubmitting || isGenerating

  // 解析提示词里的 @图N 精确引用，再拼上游文本作为生图上下文。
  const { referenceAssetIds, prompt: cleanedPrompt } = resolveReferenceImages(
    data.prompt,
    referenceImages,
  )
  const effectivePrompt = [cleanedPrompt, ...referenceTexts]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n')

  const run = () => {
    const model = endpoint?.model ?? data.model
    if (!endpointId || !model) {
      onUpdate({ result: { status: 'failed', images: [], error: '请选择可用的生图模型' } })
      return
    }
    onBeforeGenerate()
    void generate({
      mode: 'general',
      prompt: effectivePrompt,
      endpointId,
      model,
      aspectRatio: data.aspectRatio as GeneralGenerationInput['aspectRatio'],
      resolution: data.resolution as GeneralGenerationInput['resolution'],
      count: data.count,
      style: data.style as GeneralGenerationInput['style'],
      referenceStrength: data.referenceStrength,
      referenceAssetIds,
    })
  }

  const terminal = result && !activeStatuses.has(result.status)

  // 切换某张结果图是否为下游参考：非空子集时下游只注入勾选的图，空则注入全部。
  const toggleReference = (assetId: string) => {
    const current = data.referenceAssetIds
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]
    onUpdate({ data: { referenceAssetIds: next } })
  }

  // 删除单张结果图：移除资产并同步从结果与参考子集里剔除。
  const removeResultImage = (path: string, assetId: string | null) => {
    if (!result) return
    void deleteGeneratedAsset(path).catch(() => {})
    onUpdate({
      result: {
        ...result,
        images: result.images.filter((p) => p !== path),
        details: result.details?.filter((d) => d.contentPath !== path),
      },
      data: assetId ? { referenceAssetIds: data.referenceAssetIds.filter((id) => id !== assetId) } : undefined,
    })
  }

  return (
    <div className="canvas-node-form">
      <textarea
        className="canvas-node-textarea"
        value={data.prompt}
        rows={3}
        placeholder="输入生图提示词；可用 @图1、@图2 精确引用上游结果图"
        aria-label="生图提示词"
        onPointerDown={stopPointer}
        onChange={(event) => onUpdate({ data: { prompt: event.target.value } })}
      />
      {referenceAssetIds.length > 0 && (
        <p className="canvas-node-ref-hint">
          <Link2 size={12} aria-hidden="true" />
          已引用参考图 ×{referenceAssetIds.length}
        </p>
      )}
      <div className="canvas-node-controls">
        <select
          className="canvas-node-select"
          value={endpointId}
          aria-label="生图模型"
          onPointerDown={stopPointer}
          onChange={(event) => {
            const selected = imageEndpoints.find((item) => item.id === event.target.value)
            onUpdate({
              data: {
                endpointId: event.target.value,
                model: selected?.model ?? data.model,
              },
            })
          }}
        >
          {imageEndpoints.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.model}
            </option>
          ))}
        </select>
        <select
          className="canvas-node-count"
          value={data.count}
          aria-label="生成张数"
          title="一次生成多张"
          onPointerDown={stopPointer}
          onChange={(event) => onUpdate({ data: { count: Number(event.target.value) } })}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} 张
            </option>
          ))}
        </select>
        <button
          type="button"
          className="canvas-node-generate"
          disabled={busy || !endpointId}
          onPointerDown={stopPointer}
          onClick={run}
        >
          {busy ? (
            <Loader2 size={14} className="is-spinning" aria-hidden="true" />
          ) : (
            <Wand2 size={14} aria-hidden="true" />
          )}
          {busy ? '生成中…' : '生成'}
        </button>
      </div>
      {(notice || (terminal && result?.error)) && (
        <p className="canvas-node-error" role="alert">
          {notice || result?.error}
        </p>
      )}
      {busy && <p className="canvas-node-status">正在生成，结果将回填到本节点…</p>}
      {terminal && result && result.images.length > 0 && (
        <div className="canvas-node-results">
          {result.images.map((path) => {
            const assetId = assetIdFromContentPath(path)
            const isRef = assetId ? data.referenceAssetIds.includes(assetId) : false
            return (
              <div key={path} className="canvas-node-result-item">
                <AuthenticatedImage
                  path={path}
                  alt="生成结果"
                  className="canvas-node-result-image"
                />
                <div className="canvas-node-result-actions">
                  <button
                    type="button"
                    className={`canvas-node-result-pin${isRef ? ' is-active' : ''}`}
                    aria-label={isRef ? '取消作为参考' : '设为参考'}
                    aria-pressed={isRef}
                    title={isRef ? '已设为参考（点击取消）' : '设为参考'}
                    onPointerDown={stopPointer}
                    onClick={() => assetId && toggleReference(assetId)}
                  >
                    <Pin size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="canvas-node-result-download"
                    aria-label="下载结果图"
                    title="下载"
                    onPointerDown={stopPointer}
                    onClick={() => {
                      void downloadProtectedAsset(path, `istudio-${assetId ?? 'image'}.png`).catch(
                        () => {},
                      )
                    }}
                  >
                    <Download size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="canvas-node-result-remove"
                    aria-label="删除结果图"
                    title="删除"
                    onPointerDown={stopPointer}
                    onClick={() => removeResultImage(path, assetId)}
                  >
                    <Delete size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {terminal && result && result.images.length === 0 && !result.error && (
        <p className="canvas-node-placeholder">暂无结果</p>
      )}
    </div>
  )
}
