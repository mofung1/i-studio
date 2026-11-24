'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Image as ImageIcon, Type } from 'lucide-react'
import Link from 'next/link'

import { AccountBoundary } from '@/components/account-access'
import { StudioShell } from '@/components/studio-shell'
import { CanvasNodeCard } from './canvas-node-card'
import { useCanvasCapabilities } from './use-canvas-capabilities'
import {
  assetIdFromContentPath,
  edgeAllowed,
  getCanvas,
  imageNodeResult,
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
  kind: 'pan' | 'node' | 'marquee'
  nodeId?: string
  startX: number
  startY: number
  originViewport?: CanvasViewport
  /** 节点/多选拖动前各节点位置，落定后用于撤销与整体移动 */
  originNodes?: { id: string; x: number; y: number }[]
  /** 节点拖动开始前的图快照，落定后用于撤销 */
  pendingSnapshot?: GraphSnapshot
  /** 框选起点（世界坐标） */
  marqueeStart?: { x: number; y: number }
}

interface GraphSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// 视频节点类型已预留但暂未接入生成，先不暴露添加入口。
const nodeAdders: { type: CanvasNodeType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'image', label: '图像', icon: ImageIcon },
]

export function CanvasEditor({ id }: { id: string }) {
  return (
    <AccountBoundary
      section="canvas"
      title="画布"
      description="登录后在无限画布上组织生图任务，串联文生图与图生图。"
      returnTo={`/canvas/${id}`}
    >
      <CanvasEditorContent id={id} />
    </AccountBoundary>
  )
}

function CanvasEditorContent({ id }: { id: string }) {
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
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
  const clipboardRef = useRef<CanvasNode[]>([])
  const historyRef = useRef<{ undo: GraphSnapshot[]; redo: GraphSnapshot[] }>({
    undo: [],
    redo: [],
  })
  // 选择状态同步镜像：供 focus 事件读取最新选择（避免闭包里的旧值）。
  const selectedIdsRef = useRef<string[]>([])
  // 节点 pointerdown 已处理选择后，抑制随后的 focus 事件重复改选。
  const suppressFocusSelectRef = useRef(false)

  // 记录视口、节点与连线，供防抖保存读取最新值。
  const stateRef = useRef({ viewport, nodes, edges })
  stateRef.current = { viewport, nodes, edges }
  canvasIdRef.current = canvas?.id ?? null

  // 选择：单选 / 多选（Shift 点选 / 框选）。同步写入 ref，供 focus 事件读取最新值。
  const applySelection = useCallback((ids: string[]) => {
    selectedIdsRef.current = ids
    setSelectedIds(ids)
  }, [])

  const selectOnly = useCallback(
    (id: string) => {
      applySelection([id])
      setSelectedEdgeId(null)
    },
    [applySelection],
  )

  const toggleSelect = useCallback(
    (id: string) => {
      const current = selectedIdsRef.current
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      applySelection(next)
      setSelectedEdgeId(null)
    },
    [applySelection],
  )

  const clearSelection = useCallback(() => {
    applySelection([])
    setSelectedEdgeId(null)
  }, [applySelection])

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

  // 撤销/重做：记录离散的图变更（增删节点/连线、节点落定、复制粘贴），不记录打字与结果回填。
  const commitHistory = useCallback(() => {
    const { nodes: nds, edges: eds } = stateRef.current
    historyRef.current.undo.push({ nodes: nds, edges: eds })
    if (historyRef.current.undo.length > 100) historyRef.current.undo.shift()
    historyRef.current.redo = []
  }, [])

  const applySnapshot = useCallback(
    (snap: GraphSnapshot) => {
      setNodes(snap.nodes)
      setEdges(snap.edges)
      scheduleSave()
    },
    [scheduleSave],
  )

  const undo = useCallback(() => {
    const previous = historyRef.current.undo.pop()
    if (!previous) return
    historyRef.current.redo.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    applySnapshot(previous)
    clearSelection()
  }, [applySnapshot, clearSelection])

  const redo = useCallback(() => {
    const next = historyRef.current.redo.pop()
    if (!next) return
    historyRef.current.undo.push({ nodes: stateRef.current.nodes, edges: stateRef.current.edges })
    applySnapshot(next)
    clearSelection()
  }, [applySnapshot, clearSelection])

  // 复制/粘贴/复制节点：克隆配置、清空结果（避免复制 taskId 导致重复轮询），错位落点。
  const spawnClones = useCallback(
    (sources: CanvasNode[]) => {
      const created = sources.map((source) => ({
        ...structuredClone(source),
        id: crypto.randomUUID(),
        x: source.x + 24,
        y: source.y + 24,
        result: null,
      }))
      setNodes((current) => [...current, ...created])
      applySelection(created.map((n) => n.id))
      setSelectedEdgeId(null)
      scheduleSave()
    },
    [applySelection, scheduleSave],
  )

  const duplicateNodes = useCallback(
    (ids: string[]) => {
      const sources = stateRef.current.nodes.filter((n) => ids.includes(n.id))
      if (sources.length === 0) return
      commitHistory()
      spawnClones(sources)
    },
    [commitHistory, spawnClones],
  )

  const copySelected = useCallback(() => {
    const sources = stateRef.current.nodes.filter((n) => selectedIds.includes(n.id))
    if (sources.length === 0) return
    clipboardRef.current = sources.map((n) => structuredClone(n))
  }, [selectedIds])

  const pasteClipboard = useCallback(() => {
    const sources = clipboardRef.current
    if (sources.length === 0) return
    commitHistory()
    spawnClones(sources)
  }, [commitHistory, spawnClones])

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
    // 切换画布后，上一个画布的撤销历史失效，避免误把旧快照应用到新画布。
    historyRef.current = { undo: [], redo: [] }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setLoadFailed(false)
    try {
      applyGraph(await getCanvas(id))
    } catch (reason) {
      setLoadFailed(true)
      setError(reason instanceof Error ? reason.message : '画布读取失败')
    } finally {
      setLoading(false)
    }
  }, [applyGraph, id])

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

  // 框选矩形归一化（把任意方向拖出的两点规整为左上角 + 宽高）。
  const normalizeRect = (x1: number, y1: number, x2: number, y2: number) => ({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  })

  // 与选框相交的节点 ID（含部分相交）。
  const nodesInRect = (rect: { x: number; y: number; w: number; h: number }): string[] => {
    const ids: string[] = []
    for (const node of nodes) {
      const r = nodeRect(node)
      if (
        node.x < rect.x + rect.w &&
        node.x + r.w > rect.x &&
        node.y < rect.y + rect.h &&
        node.y + r.h > rect.y
      ) {
        ids.push(node.id)
      }
    }
    return ids
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
    commitHistory()
    setNodes((current) => [...current, node])
    applySelection([node.id])
    setSelectedEdgeId(null)
    scheduleSave()
  }

  const deleteNodes = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      commitHistory()
      const removing = new Set(ids)
      setNodes((current) => current.filter((node) => !removing.has(node.id)))
      setEdges((current) =>
        current.filter((edge) => !removing.has(edge.source) && !removing.has(edge.target)),
      )
      applySelection([])
      scheduleSave()
    },
    [applySelection, commitHistory, scheduleSave],
  )

  const onDeleteEdge = () => {
    if (!selectedEdgeId) return
    const id = selectedEdgeId
    commitHistory()
    setEdges((current) => current.filter((edge) => edge.id !== id))
    setSelectedEdgeId(null)
    scheduleSave()
  }

  const onRenameCanvas = (name: string) => {
    if (!canvas) return
    const trimmed = name.trim() || '未命名画布'
    setCanvas({ ...canvas, name: trimmed })
    scheduleSave()
  }

  // 指针事件：平移 / 框选 / 拖节点（支持多选整体移动）。
  const onSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    const surface = surfaceRef.current
    if (!surface) return
    if (event.button === 0 && event.shiftKey) {
      // Shift + 左键在空白处拖出选框。
      const [wx, wy] = clientToWorld(event.clientX, event.clientY)
      dragRef.current = {
        kind: 'marquee',
        startX: event.clientX,
        startY: event.clientY,
        marqueeStart: { x: wx, y: wy },
      }
      setMarquee({ x1: wx, y1: wy, x2: wx, y2: wy })
      surface.setPointerCapture(event.pointerId)
      return
    }
    // 空白处点击/平移：清除选择。
    clearSelection()
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
    // 本次 pointerdown 已处理选择，抑制随后的 focus 事件重复改选（下一宏任务复位）。
    suppressFocusSelectRef.current = true
    window.setTimeout(() => {
      suppressFocusSelectRef.current = false
    }, 0)
    // Shift 点选切换多选，不进入拖动；否则点击已选节点保留整组，未选则单选。
    if (event.shiftKey) {
      toggleSelect(node.id)
      return
    }
    const movingIds = selectedIdsRef.current.includes(node.id) ? selectedIdsRef.current : [node.id]
    if (!selectedIdsRef.current.includes(node.id)) selectOnly(node.id)
    else setSelectedEdgeId(null)
    const originNodes = movingIds
      .map((id) => {
        const found = stateRef.current.nodes.find((n) => n.id === id)
        return found ? { id, x: found.x, y: found.y } : null
      })
      .filter((item): item is { id: string; x: number; y: number } => item !== null)
    dragRef.current = {
      kind: 'node',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originNodes,
      pendingSnapshot: { nodes: stateRef.current.nodes, edges: stateRef.current.edges },
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
    if (drag.kind === 'marquee' && drag.marqueeStart) {
      const [wx, wy] = clientToWorld(event.clientX, event.clientY)
      setMarquee({ x1: drag.marqueeStart.x, y1: drag.marqueeStart.y, x2: wx, y2: wy })
      return
    }
    if (drag.kind === 'node' && drag.nodeId && drag.originNodes) {
      const zoom = viewport.zoom || 1
      const dxWorld = dx / zoom
      const dyWorld = dy / zoom
      setNodes((current) =>
        current.map((node) => {
          const origin = drag.originNodes!.find((o) => o.id === node.id)
          if (!origin) return node
          return { ...node, x: origin.x + dxWorld, y: origin.y + dyWorld }
        }),
      )
    }
  }

  const finalizeNodeDrag = (drag: DragState) => {
    if (drag.kind !== 'node' || !drag.pendingSnapshot || !drag.originNodes) return
    const moved = stateRef.current.nodes.find((n) => n.id === drag.nodeId)
    const origin = drag.originNodes.find((o) => o.id === drag.nodeId)
    if (moved && origin && (moved.x !== origin.x || moved.y !== origin.y)) {
      historyRef.current.undo.push(drag.pendingSnapshot)
      if (historyRef.current.undo.length > 100) historyRef.current.undo.shift()
      historyRef.current.redo = []
    }
  }

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (drag.kind === 'marquee') {
      const [wx, wy] = clientToWorld(event.clientX, event.clientY)
      const rect = normalizeRect(drag.marqueeStart!.x, drag.marqueeStart!.y, wx, wy)
      applySelection(nodesInRect(rect))
      setSelectedEdgeId(null)
      setMarquee(null)
      return
    }
    finalizeNodeDrag(drag)
    scheduleSave()
  }

  const onPointerCancel = () => {
    const drag = dragRef.current
    dragRef.current = null
    setMarquee(null)
    if (drag) finalizeNodeDrag(drag)
  }

  // 连线拖拽：从输出端口按下，捕获指针，命中输入端口时建立连线。
  const startEdgeDraw = (node: CanvasNode, event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const [wx, wy] = clientToWorld(event.clientX, event.clientY)
    draftSourceRef.current = node.id
    setDraftEdge({ sourceId: node.id, x: wx, y: wy })
    clearSelection()
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
    commitHistory()
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
    const target = event.target as HTMLElement
    // 焦点在输入框内时，复制/粘贴/撤销/删除都交给浏览器原生行为处理。
    const isEditing =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    if (isEditing) return

    const mod = event.metaKey || event.ctrlKey

    if ((event.key === 'Delete' || event.key === 'Backspace') && !mod) {
      event.preventDefault()
      if (selectedEdgeId) onDeleteEdge()
      else deleteNodes(selectedIds)
      return
    }

    if (event.key === 'Escape' && !mod) {
      clearSelection()
      return
    }

    if (!mod) return
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      event.preventDefault()
      redo()
    } else if (key === 'd') {
      event.preventDefault()
      if (selectedIds.length > 0) duplicateNodes(selectedIds)
    } else if (key === 'c') {
      if (selectedIds.length > 0) {
        event.preventDefault()
        copySelected()
      }
    } else if (key === 'v') {
      event.preventDefault()
      pasteClipboard()
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
          <Link className="studio-secondary" href="/canvas">
            <ArrowLeft size={16} aria-hidden="true" />
            返回画布列表
          </Link>
        </>
      }
    >
      {loadFailed ? (
        <div className="canvas-manager-empty canvas-manager-empty--center">
          <ImageIcon size={34} aria-hidden="true" />
          <strong>画布不存在或已删除</strong>
          <p>{error}</p>
          <Link className="studio-primary" href="/canvas">
            返回画布列表
          </Link>
        </div>
      ) : (
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
              滚轮缩放 · 拖空白平移 · ⇧拖框选 · 拖节点圆点连线 · ⌘Z 撤销 ⌘D 复制 · Delete 删除
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
            onPointerCancel={onPointerCancel}
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
                            applySelection([])
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

              {marquee && (
                <div
                  className="canvas-marquee"
                  style={{
                    left: Math.min(marquee.x1, marquee.x2),
                    top: Math.min(marquee.y1, marquee.y2),
                    width: Math.abs(marquee.x2 - marquee.x1),
                    height: Math.abs(marquee.y2 - marquee.y1),
                  }}
                  aria-hidden="true"
                />
              )}

              {nodes.map((node) => {
                const refs = referencesFor(node.id)
                return (
                  <CanvasNodeCard
                    key={node.id}
                    node={node}
                    selected={selectedIds.includes(node.id)}
                    imageEndpoints={capabilities.imageEndpoints}
                    promptEnhanceEnabled={capabilities.promptEnhanceEnabled}
                    referenceImages={refs.referenceImages}
                    referenceTexts={refs.referenceTexts}
                    onPointerDown={(event) => onNodePointerDown(event, node)}
                    onSelect={() => {
                      if (suppressFocusSelectRef.current) return
                      if (!selectedIdsRef.current.includes(node.id)) selectOnly(node.id)
                    }}
                    onDelete={() => deleteNodes([node.id])}
                    onDuplicate={() => duplicateNodes([node.id])}
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

            {!loading && nodes.length === 0 && (
              <div className="canvas-empty" role="status">
                <p className="canvas-empty-title">空白画布</p>
                <p>从上方工具栏添加文本 / 图像节点，拖节点下方圆点把结果串联成生成链路。</p>
              </div>
            )}
          </div>

          {error && (
            <p className="canvas-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </StudioShell>
  )
}
