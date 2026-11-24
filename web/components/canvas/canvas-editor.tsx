'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete, Image as ImageIcon, Plus, Type, Video } from 'lucide-react'

import { AccountBoundary } from '@/components/account-access'
import { StudioShell } from '@/components/studio-shell'
import { CanvasNodeCard } from './canvas-node-card'
import { useCanvasCapabilities } from './use-canvas-capabilities'
import {
  createCanvas,
  deleteCanvas,
  getCanvas,
  listCanvases,
  newCanvasNode,
  saveCanvas,
  type CanvasNode,
  type CanvasNodeType,
  type CanvasRecord,
  type CanvasViewport,
} from '@/lib/canvas'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 6
const SAVE_DEBOUNCE_MS = 700

interface DragState {
  kind: 'pan' | 'node'
  nodeId?: string
  startX: number
  startY: number
  originViewport?: CanvasViewport
  originNode?: { x: number; y: number }
}

const nodeAdders: { type: CanvasNodeType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'image', label: '图像', icon: ImageIcon },
  { type: 'video', label: '视频', icon: Video },
]

export function CanvasEditor() {
  return (
    <AccountBoundary
      section="canvas"
      title="画布"
      description="登录后在无限画布上组织生图任务，串联文生图与图生图。"
      returnTo="/canvas"
    >
      <CanvasEditorContent />
    </AccountBoundary>
  )
}

function CanvasEditorContent() {
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null)
  const [canvases, setCanvases] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 })
  const [nodes, setNodes] = useState<CanvasNode[]>([])

  const surfaceRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasIdRef = useRef<string | null>(null)

  // 记录视口与节点，供防抖保存读取最新值。
  const stateRef = useRef({ viewport, nodes })
  stateRef.current = { viewport, nodes }
  canvasIdRef.current = canvas?.id ?? null

  const scheduleSave = useCallback(() => {
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const id = canvasIdRef.current
      if (!id) return
      const { viewport: vp, nodes: nds } = stateRef.current
      try {
        await saveCanvas(id, { viewport: vp, graph: { nodes: nds, edges: [] } })
        setSaveState('saved')
      } catch (reason) {
        setSaveState('error')
        setError(reason instanceof Error ? reason.message : '画布保存失败')
      }
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const capabilities = useCanvasCapabilities()

  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>) => {
      setNodes((current) =>
        current.map((n) => {
          if (n.id !== id) return n
          const next = { ...n, ...patch }
          if (patch.data) next.data = { ...n.data, ...patch.data }
          return next
        }),
      )
      scheduleSave()
    },
    [scheduleSave],
  )

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await listCanvases()
      setCanvases(list)
      const first = list[0]
      if (first) {
        const record = await getCanvas(first.id)
        setCanvas(record)
        setViewport(record.viewport)
        setNodes(record.graph.nodes ?? [])
      } else {
        const record = await createCanvas('未命名画布')
        setCanvases([{ id: record.id, name: record.name }])
        setCanvas(record)
        setViewport(record.viewport)
        setNodes(record.graph.nodes ?? [])
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 画布容器持有键盘焦点，Delete 删除选中节点；点击空白后焦点回到容器。
  useEffect(() => {
    editorRef.current?.focus()
  }, [])

  const onAddNode = (type: CanvasNodeType) => {
    const surface = surfaceRef.current
    const rect = surface?.getBoundingClientRect()
    const w = rect?.width ?? 800
    const h = rect?.height ?? 600
    // 节点落在当前视口中心附近（世界坐标），并稍作错位避免完全重叠。
    const cx = (w / 2 - viewport.x) / viewport.zoom
    const cy = (h / 2 - viewport.y) / viewport.zoom
    const offset = nodes.length * 24
    const node = newCanvasNode(type, cx - 160 + offset, cy - 130 + offset)
    if (type === 'image') {
      const fallback = capabilities.imageEndpoints[0]
      node.data = {
        prompt: '',
        endpointId: fallback?.id ?? '',
        model: fallback?.model ?? '',
        aspectRatio: '1:1',
        resolution: '2K',
        count: 1,
        style: 'unspecified',
        referenceStrength: 'medium',
      }
    } else if (type === 'text') {
      node.data = { prompt: '', instruction: '' }
    }
    const next = [...nodes, node]
    setNodes(next)
    setSelectedId(node.id)
    scheduleSave()
  }

  const onDeleteSelected = () => {
    if (!selectedId) return
    setNodes((current) => current.filter((node) => node.id !== selectedId))
    setSelectedId(null)
    scheduleSave()
  }

  const onNewCanvas = async () => {
    setError('')
    try {
      const record = await createCanvas('未命名画布')
      setCanvases((current) => [{ id: record.id, name: record.name }, ...current])
      setCanvas(record)
      setViewport(record.viewport)
      setNodes(record.graph.nodes ?? [])
      setSelectedId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '新建画布失败')
    }
  }

  const onSwitchCanvas = async (id: string) => {
    if (id === canvas?.id) return
    setError('')
    try {
      const record = await getCanvas(id)
      setCanvas(record)
      setViewport(record.viewport)
      setNodes(record.graph.nodes ?? [])
      setSelectedId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布读取失败')
    }
  }

  const onRenameCanvas = (name: string) => {
    if (!canvas) return
    const trimmed = name.trim() || '未命名画布'
    setCanvas({ ...canvas, name: trimmed })
    setCanvases((current) =>
      current.map((item) => (item.id === canvas.id ? { ...item, name: trimmed } : item)),
    )
    scheduleSave()
  }

  const onDeleteCanvas = async () => {
    if (!canvas) return
    setError('')
    try {
      await deleteCanvas(canvas.id)
      const rest = canvases.filter((item) => item.id !== canvas.id)
      setCanvases(rest)
      const next = rest[0]
      if (next) {
        const record = await getCanvas(next.id)
        setCanvas(record)
        setViewport(record.viewport)
        setNodes(record.graph.nodes ?? [])
      } else {
        const record = await createCanvas('未命名画布')
        setCanvases([{ id: record.id, name: record.name }])
        setCanvas(record)
        setViewport(record.viewport)
        setNodes(record.graph.nodes ?? [])
      }
      setSelectedId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布删除失败')
    }
  }

  // 指针事件：平移与拖节点。统一在 window 上收尾，避免快速拖动时丢事件。
  const onSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    const surface = surfaceRef.current
    if (!surface) return
    dragRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      originViewport: viewport,
    }
    surface.setPointerCapture(event.pointerId)
  }

  const onNodePointerDown = (event: React.PointerEvent, node: CanvasNode) => {
    if (event.button !== 0) return
    event.stopPropagation()
    setSelectedId(node.id)
    dragRef.current = {
      kind: 'node',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originNode: { x: node.x, y: node.y },
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.kind === 'pan' && drag.originViewport) {
      setViewport({
        ...drag.originViewport,
        x: drag.originViewport.x + dx,
        y: drag.originViewport.y + dy,
      })
      return
    }
    if (drag.kind === 'node' && drag.nodeId && drag.originNode) {
      const zoom = viewport.zoom || 1
      setNodes((current) =>
        current.map((node) =>
          node.id === drag.nodeId
            ? { ...node, x: drag.originNode!.x + dx / zoom, y: drag.originNode!.y + dy / zoom }
            : node,
        ),
      )
    }
  }

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null
      scheduleSave()
    }
  }

  const onWheel = (event: React.WheelEvent) => {
    const surface = surfaceRef.current
    if (!surface) return
    const rect = surface.getBoundingClientRect()
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, viewport.zoom * factor))
    if (nextZoom === viewport.zoom) return
    // 缩放锚定鼠标位置：鼠标下的世界坐标保持不变。
    const worldX = (event.clientX - rect.left - viewport.x) / viewport.zoom
    const worldY = (event.clientY - rect.top - viewport.y) / viewport.zoom
    setViewport({
      zoom: nextZoom,
      x: event.clientX - rect.left - worldX * nextZoom,
      y: event.clientY - rect.top - worldY * nextZoom,
    })
    scheduleSave()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
        return
      event.preventDefault()
      onDeleteSelected()
    }
  }

  const saveLabel =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'saved'
        ? '已保存'
        : saveState === 'error'
          ? '保存失败'
          : ''

  return (
    <StudioShell
      section="canvas"
      title="画布"
      actions={
        <>
          <label className="canvas-name-field">
            <span className="sr-only">画布名称</span>
            <input
              value={canvas?.name ?? ''}
              onChange={(event) => onRenameCanvas(event.target.value)}
              disabled={!canvas}
              aria-label="画布名称"
            />
          </label>
          {canvases.length > 1 && (
            <select
              className="studio-secondary canvas-select"
              value={canvas?.id ?? ''}
              onChange={(event) => onSwitchCanvas(event.target.value)}
              aria-label="切换画布"
            >
              {canvases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="studio-secondary" onClick={onNewCanvas}>
            <Plus size={16} aria-hidden="true" />
            新建画布
          </button>
          {canvas && (
            <button
              type="button"
              className="studio-secondary"
              onClick={onDeleteCanvas}
              aria-label="删除当前画布"
              title="删除当前画布"
            >
              <Delete size={16} aria-hidden="true" />
            </button>
          )}
        </>
      }
    >
      <div
        className={`canvas-editor${loading ? ' is-loading' : ''}`}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        ref={editorRef}
      >
        <div className="canvas-toolbar" role="toolbar" aria-label="添加节点">
          {nodeAdders.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              className="canvas-tool"
              onClick={() => onAddNode(type)}
              title={`添加${label}节点`}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <span className="canvas-toolbar-hint">滚轮缩放 · 拖空白平移 · Delete 删除选中节点</span>
          {saveLabel && (
            <span className={`canvas-save-state is-${saveState}`} role="status">
              {saveLabel}
            </span>
          )}
        </div>

        <div
          className="canvas-surface"
          ref={surfaceRef}
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <div
            className="canvas-world"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            }}
          >
            {nodes.map((node) => (
              <CanvasNodeCard
                key={node.id}
                node={node}
                selected={node.id === selectedId}
                imageEndpoints={capabilities.imageEndpoints}
                promptEnhanceEnabled={capabilities.promptEnhanceEnabled}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                onSelect={() => setSelectedId(node.id)}
                onDelete={onDeleteSelected}
                onUpdate={(patch) => updateNode(node.id, patch)}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="canvas-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </StudioShell>
  )
}
