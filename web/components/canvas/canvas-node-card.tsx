'use client'

import { useState } from 'react'
import { Delete, Image as ImageIcon, Loader2, Type, Video, Wand2 } from 'lucide-react'

import { AuthenticatedImage } from '@/components/authenticated-image'
import { completeText } from '@/lib/api'
import type { GeneralGenerationInput } from '@/lib/contracts'
import type { PublicImageModel } from '@/lib/generation-models'
import {
  canvasNodeDefaults,
  imageNodeData,
  imageNodeResult,
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
  onPointerDown: (event: React.PointerEvent) => void
  onSelect: () => void
  onDelete: () => void
  onUpdate: (patch: Partial<CanvasNode>) => void
}

export function CanvasNodeCard({
  node,
  selected,
  imageEndpoints,
  promptEnhanceEnabled,
  onPointerDown,
  onSelect,
  onDelete,
  onUpdate,
}: CanvasNodeCardProps) {
  const label = canvasNodeDefaults[node.type].label
  const Icon = node.type === 'text' ? Type : node.type === 'image' ? ImageIcon : Video
  return (
    <div
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
      <div className="canvas-node-body">
        {node.type === 'text' ? (
          <TextNodeBody
            node={node}
            promptEnhanceEnabled={promptEnhanceEnabled}
            onUpdate={onUpdate}
          />
        ) : node.type === 'image' ? (
          <ImageNodeBody node={node} imageEndpoints={imageEndpoints} onUpdate={onUpdate} />
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
  onUpdate,
}: {
  node: CanvasNode
  promptEnhanceEnabled: boolean
  onUpdate: (patch: Partial<CanvasNode>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = textNodeData(node)
  const result = node.result as CanvasTextNodeResult | null

  const run = async () => {
    const prompt = data.prompt.trim()
    if (!prompt) {
      setError('请先输入文本')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await completeText({ text: prompt, instruction: data.instruction.trim() })
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
        placeholder="输入要处理的文本"
        aria-label="文本内容"
        onPointerDown={stopPointer}
        onChange={(event) => onUpdate({ data: { prompt: event.target.value } })}
      />
      <input
        className="canvas-node-instruction"
        value={data.instruction}
        placeholder="任务说明（可选，如：改写得更口语化）"
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
  onUpdate,
}: {
  node: CanvasNode
  imageEndpoints: PublicImageModel[]
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

  const run = () => {
    const model = endpoint?.model ?? data.model
    if (!endpointId || !model) {
      onUpdate({ result: { status: 'failed', images: [], error: '请选择可用的生图模型' } })
      return
    }
    void generate({
      mode: 'general',
      prompt: data.prompt,
      endpointId,
      model,
      aspectRatio: data.aspectRatio as GeneralGenerationInput['aspectRatio'],
      resolution: data.resolution as GeneralGenerationInput['resolution'],
      count: data.count,
      style: data.style as GeneralGenerationInput['style'],
      referenceStrength: data.referenceStrength,
      referenceAssetIds: [],
    })
  }

  const terminal = result && !activeStatuses.has(result.status)

  return (
    <div className="canvas-node-form">
      <textarea
        className="canvas-node-textarea"
        value={data.prompt}
        rows={3}
        placeholder="输入生图提示词"
        aria-label="生图提示词"
        onPointerDown={stopPointer}
        onChange={(event) => onUpdate({ data: { prompt: event.target.value } })}
      />
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
          {result.images.map((path) => (
            <AuthenticatedImage
              key={path}
              path={path}
              alt="生成结果"
              className="canvas-node-result-image"
            />
          ))}
        </div>
      )}
      {terminal && result && result.images.length === 0 && !result.error && (
        <p className="canvas-node-placeholder">暂无结果</p>
      )}
    </div>
  )
}
