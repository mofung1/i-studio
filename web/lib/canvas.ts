import { frontendRequest } from './frontend-request'

export type CanvasNodeType = 'text' | 'image' | 'video'

export interface CanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  w: number
  h: number
  data: Record<string, unknown>
  result: Record<string, unknown> | null
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface CanvasRecord {
  id: string
  name: string
  viewport: CanvasViewport
  graph: CanvasGraph
  createdAt: string
  updatedAt: string
}

export interface CanvasSummary {
  id: string
  name: string
  updatedAt: string
}

export interface CanvasSaveInput {
  name?: string
  viewport: CanvasViewport
  graph: CanvasGraph
}

/** 节点类型到默认尺寸与标签；视频类型预留，尚未接入生成。 */
export const canvasNodeDefaults: Record<CanvasNodeType, { w: number; h: number; label: string }> = {
  text: { w: 320, h: 160, label: '文本' },
  image: { w: 360, h: 260, label: '图像' },
  video: { w: 360, h: 260, label: '视频' },
}

export function newCanvasNode(type: CanvasNodeType, x: number, y: number): CanvasNode {
  const defaults = canvasNodeDefaults[type]
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    w: defaults.w,
    h: defaults.h,
    data: {},
    result: null,
  }
}

export async function listCanvases(): Promise<CanvasSummary[]> {
  const payload = await frontendRequest<{ canvases: CanvasSummary[] }>('canvases')
  return payload.canvases ?? []
}

export async function createCanvas(name: string): Promise<CanvasRecord> {
  const payload = await frontendRequest<{ canvas: CanvasRecord }>('canvases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return payload.canvas
}

export async function getCanvas(id: string): Promise<CanvasRecord> {
  const payload = await frontendRequest<{ canvas: CanvasRecord }>(`canvases/${id}`)
  return payload.canvas
}

export async function saveCanvas(id: string, input: CanvasSaveInput): Promise<void> {
  await frontendRequest<{ updated: string }>(`canvases/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function deleteCanvas(id: string): Promise<void> {
  await frontendRequest<{ deleted: string }>(`canvases/${id}`, {
    method: 'DELETE',
  })
}
