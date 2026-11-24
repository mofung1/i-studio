'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Delete, Image as ImageIcon, Plus, Type, Video } from 'lucide-react'

import { AccountBoundary } from '@/components/account-access'
import { StudioShell } from '@/components/studio-shell'
import { CanvasNodeCard } from './canvas-node-card'
import { useCanvasCapabilities } from './use-canvas-capabilities'
import {
  assetIdFromContentPath,
  createCanvas,
  deleteCanvas,
  edgeAllowed,
  getCanvas,
  imageNodeResult,
  listCanvases,
  newCanvasNode,
  saveCanvas,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
  type CanvasRecord,
  type CanvasTextNodeResult,
  type CanvasViewport,
} from '@/lib/canvas'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 6
const SAVE_DEBOUNCE_MS = 700
const PORT_R = 8
const PORT_HIT_RADIUS = 16
const EDGE_PAD = 80

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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, zoom: 1 })
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [nodeSizes, setNodeSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [draftEdge, setDraftEdge] = useState<{ sourceId: string; x: number; y: number } | null>(
    null,
  )

  const surfaceRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const draftSourceRef = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasIdRef = useRef<string | null>(null)

  // 记录视口、节点与连线，供防抖保存读取最新值。
  const stateRef = useRef({ viewport, nodes, edges })
  stateRef.current = { viewport, nodes, edges }
  canvasIdRef.current = canvas?.id ?? null

  const scheduleSave = useCallback(() => {
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const id = canvasIdRef.current
      if (!id) return
      const { viewport: vp, nodes: nds, edges: eds } = stateRef.current
      try {
        await saveCanvas(id, { viewport: vp, graph: { nodes: nds, edges: eds } })
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

  const onNodeSize = useCallback((id: string, w: number, h: number) => {
    setNodeSizes((previous) => {
      const current = previous[id]
      if (current && Math.abs(current.w - w) < 1 && Math.abs(current.h - h) < 1) return previous
      return { ...previous, [id]: { w, h } }
    })
  }, [])

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  const applyGraph = useCallback((record: CanvasRecord) => {
    setCanvas(record)
    setViewport(record.viewport)
    setNodes(record.graph.nodes ?? [])
    setEdges(record.graph.edges ?? [])
    setNodeSizes({})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await listCanvases()
      setCanvases(list)
      const first = list[0]
      if (first) {
        applyGraph(await getCanvas(first.id))
      } else {
        const record = await createCanvas('未命名画布')
        setCanvases([{ id: record.id, name: record.name }])
        applyGraph(record)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布读取失败')
    } finally {
      setLoading(false)
    }
  }, [applyGraph])

  useEffect(() => {
    void load()
  }, [load])

  // 画布容器持有键盘焦点，Delete 删除选中节点/连线。
  useEffect(() => {
    editorRef.current?.focus()
  }, [])

  // 世界坐标几何：节点实测尺寸 → 端口位置 → 连线路径。
  const nodeRect = (node: CanvasNode) => {
    const size = nodeSizes[node.id]
    return { w: size?.w ?? node.w, h: size?.h ?? node.h }
  }
  const outputPort = (node: CanvasNode) => {
    const r = nodeRect(node)
    return { x: node.x + r.w / 2, y: node.y + r.h }
  }
  const inputPort = (node: CanvasNode) => {
    const r = nodeRect(node)
    return { x: node.x + r.w / 2, y: node.y }
  }
  const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dy = Math.max(40, Math.abs(y2 - y1) * 0.5)
    return `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`
  }

  const clientToWorld = (clientX: number, clientY: number): [number, number] => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    const left = rect?.left ?? 0
    const top = rect?.top ?? 0
    return [
      (clientX - left - viewport.x) / viewport.zoom,
      (clientY - top - viewport.y) / viewport.zoom,
    ]
  }

  /** 命中检测：指针世界坐标附近的合法输入端口（节点 ID 或 null）。 */
  const validInputTarget = (sourceId: string, wx: number, wy: number): string | null => {
    const source = nodes.find((n) => n.id === sourceId)
    if (!source) return null
    const radius = PORT_HIT_RADIUS / viewport.zoom
    let bestId: string | null = null
    let bestDist = Infinity
    for (const node of nodes) {
      if (node.id === sourceId || node.type === 'video') continue
      if (!edgeAllowed(source.type, node.type)) continue
      // 图生文需要文本模型支持识图
      if (source.type === 'image' && node.type === 'text' && !capabilities.promptVision) continue
      const p = inputPort(node)
      const dist = Math.hypot(p.x - wx, p.y - wy)
      if (dist < radius && dist < bestDist) {
        bestDist = dist
        bestId = node.id
      }
    }
    return bestId
  }

  const referencesFor = useCallback(
    (nodeId: string) => {
      const referenceImages: string[] = []
      const referenceTexts: string[] = []
      for (const edge of edges) {
        if (edge.target !== nodeId) continue
        const source = nodes.find((n) => n.id === edge.source)
        if (!source) continue
        if (source.type === 'image') {
          const result = imageNodeResult(source)
          for (const path of result?.images ?? []) {
            const id = assetIdFromContentPath(path)
            if (id) referenceImages.push(id)
          }
        } else if (source.type === 'text') {
          const result = source.result as CanvasTextNodeResult | null
          const text = result?.text?.trim()
          if (text) referenceTexts.push(text)
        }
      }
      return { referenceImages, referenceTexts }
    },
    [edges, nodes],
  )

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
    setNodes((current) => [...current, node])
    setSelectedId(node.id)
    setSelectedEdgeId(null)
    scheduleSave()
  }

  const onDeleteSelected = () => {
    if (!selectedId) return
    const id = selectedId
    setNodes((current) => current.filter((node) => node.id !== id))
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id))
    setSelectedId(null)
    scheduleSave()
  }

  const onDeleteEdge = () => {
    if (!selectedEdgeId) return
    const id = selectedEdgeId
    setEdges((current) => current.filter((edge) => edge.id !== id))
    setSelectedEdgeId(null)
    scheduleSave()
  }

  const onNewCanvas = async () => {
    setError('')
    try {
      const record = await createCanvas('未命名画布')
      setCanvases((current) => [{ id: record.id, name: record.name }, ...current])
      applyGraph(record)
      setSelectedId(null)
      setSelectedEdgeId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '新建画布失败')
    }
  }

  const onSwitchCanvas = async (id: string) => {
    if (id === canvas?.id) return
    setError('')
    try {
      applyGraph(await getCanvas(id))
      setSelectedId(null)
      setSelectedEdgeId(null)
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
        applyGraph(await getCanvas(next.id))
      } else {
        const record = await createCanvas('未命名画布')
        setCanvases([{ id: record.id, name: record.name }])
        applyGraph(record)
      }
      setSelectedId(null)
      setSelectedEdgeId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布删除失败')
    }
  }

  // 指针事件：平移与拖节点。
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
    setSelectedEdgeId(null)
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

  // 连线拖拽：从输出端口按下，捕获指针，命中输入端口时建立连线。
  const startEdgeDraw = (node: CanvasNode, event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const [wx, wy] = clientToWorld(event.clientX, event.clientY)
    draftSourceRef.current = node.id
    setDraftEdge({ sourceId: node.id, x: wx, y: wy })
    setSelectedId(null)
    setSelectedEdgeId(null)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const moveEdgeDraw = (event: React.PointerEvent) => {
    if (!draftSourceRef.current) return
    const [wx, wy] = clientToWorld(event.clientX, event.clientY)
    setDraftEdge((current) => (current ? { ...current, x: wx, y: wy } : current))
  }

  const endEdgeDraw = (event: React.PointerEvent) => {
    const sourceId = draftSourceRef.current
    draftSourceRef.current = null
    setDraftEdge(null)
    if (!sourceId) return
    const [wx, wy] = clientToWorld(event.clientX, event.clientY)
    const targetId = validInputTarget(sourceId, wx, wy)
    if (!targetId) return
    const duplicate = edges.some((edge) => edge.source === sourceId && edge.target === targetId)
    if (duplicate) return
    setEdges((current) => [
      ...current,
      { id: crypto.randomUUID(), source: sourceId, target: targetId },
    ])
    scheduleSave()
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
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      return
    if (selectedEdgeId) {
      event.preventDefault()
      onDeleteEdge()
    } else if (selectedId) {
      event.preventDefault()
      onDeleteSelected()
    }
  }

  // 连线包围盒：SVG 覆盖所有节点并留白，保证曲线与端口命中都在 SVG 内。
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const node of nodes) {
      const r = nodeRect(node)
      minX = Math.min(minX, node.x)
      minY = Math.min(minY, node.y)
      maxX = Math.max(maxX, node.x + r.w)
      maxY = Math.max(maxY, node.y + r.h)
    }
    return {
      x: minX - EDGE_PAD,
      y: minY - EDGE_PAD,
      width: maxX - minX + EDGE_PAD * 2,
      height: maxY - minY + EDGE_PAD * 2,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, nodeSizes])

  const draftTargetId = draftEdge
    ? validInputTarget(draftEdge.sourceId, draftEdge.x, draftEdge.y)
    : null

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
          <span className="canvas-toolbar-hint">
            滚轮缩放 · 拖空白平移 · 拖节点下方圆点连线 · Delete 删除
          </span>
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
            <svg
              className="canvas-edges"
              style={{
                left: bounds.x,
                top: bounds.y,
                width: Math.max(bounds.width, 1),
                height: Math.max(bounds.height, 1),
              }}
              aria-hidden="true"
            >
              <g transform={`translate(${-bounds.x}, ${-bounds.y})`}>
                {edges.map((edge) => {
                  const source = nodes.find((n) => n.id === edge.source)
                  const target = nodes.find((n) => n.id === edge.target)
                  if (!source || !target) return null
                  const sp = outputPort(source)
                  const tp = inputPort(target)
                  const d = edgePath(sp.x, sp.y, tp.x, tp.y)
                  const selected = selectedEdgeId === edge.id
                  return (
                    <g key={edge.id}>
                      <path
                        className="canvas-edge-hit"
                        d={d}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          setSelectedEdgeId(edge.id)
                          setSelectedId(null)
                        }}
                      />
                      <path className={`canvas-edge${selected ? ' is-selected' : ''}`} d={d} />
                    </g>
                  )
                })}
                {draftEdge &&
                  (() => {
                    const source = nodes.find((n) => n.id === draftEdge.sourceId)
                    if (!source) return null
                    const sp = outputPort(source)
                    return (
                      <path
                        className="canvas-edge is-draft"
                        d={edgePath(sp.x, sp.y, draftEdge.x, draftEdge.y)}
                      />
                    )
                  })()}
              </g>
            </svg>

            {nodes.map((node) => {
              const refs = referencesFor(node.id)
              return (
                <CanvasNodeCard
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  imageEndpoints={capabilities.imageEndpoints}
                  promptEnhanceEnabled={capabilities.promptEnhanceEnabled}
                  referenceImages={refs.referenceImages}
                  referenceTexts={refs.referenceTexts}
                  onPointerDown={(event) => onNodePointerDown(event, node)}
                  onSelect={() => {
                    setSelectedId(node.id)
                    setSelectedEdgeId(null)
                  }}
                  onDelete={onDeleteSelected}
                  onUpdate={(patch) => updateNode(node.id, patch)}
                  onSize={onNodeSize}
                />
              )
            })}

            {nodes.map((node) => {
              if (node.type === 'video') return null
              const out = outputPort(node)
              const inp = inputPort(node)
              return (
                <div key={`ports-${node.id}`}>
                  <div
                    className={`canvas-port is-input${draftTargetId === node.id ? ' is-highlight' : ''}`}
                    style={{ left: inp.x - PORT_R, top: inp.y - PORT_R }}
                    aria-hidden="true"
                  />
                  <div
                    className="canvas-port is-output"
                    style={{ left: out.x - PORT_R, top: out.y - PORT_R }}
                    aria-hidden="true"
                    title="拖到另一个节点的输入端口建立连线"
                    onPointerDown={(event) => startEdgeDraw(node, event)}
                    onPointerMove={moveEdgeDraw}
                    onPointerUp={endEdgeDraw}
                    onPointerCancel={() => {
                      draftSourceRef.current = null
                      setDraftEdge(null)
                    }}
                  />
                </div>
              )
            })}
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
