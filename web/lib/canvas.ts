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

/** 文本节点配置：文生文。 */
export interface CanvasTextNodeData {
  prompt: string
  /** 可选任务说明，例如「改写得更口语化」「翻译成英文」；留空时默认润色。 */
  instruction: string
}

/** 文本节点结果：LLM 生成的文本。 */
export interface CanvasTextNodeResult {
  text: string
  model?: string
}

/** 图像节点配置：文生图 / 图生图。 */
export interface CanvasImageNodeData {
  prompt: string
  endpointId: string
  model: string
  aspectRatio: string
  resolution: string
  count: number
  style: string
  referenceStrength: 'low' | 'medium' | 'high'
}

export interface CanvasImageResultDetail {
  contentPath: string
  width: number
  height: number
  sizeBytes: number
  elapsedMs: number | null
}

/** 图像节点结果：status 为 active 时记录 taskId，刷新后可续接轮询。 */
export interface CanvasImageNodeResult {
  status: string
  taskId?: string
  images: string[]
  details?: CanvasImageResultDetail[]
  error?: string
}

export function textNodeData(node: CanvasNode): CanvasTextNodeData {
  const data = (node.data ?? {}) as Partial<CanvasTextNodeData>
  return {
    prompt: typeof data.prompt === 'string' ? data.prompt : '',
    instruction: typeof data.instruction === 'string' ? data.instruction : '',
  }
}

/** 读取图像节点结果；服务端会把 null 归一化成空对象，这里统一按无结果处理。 */
export function imageNodeResult(node: CanvasNode): CanvasImageNodeResult | null {
  const result = node.result
  if (!result || typeof result !== 'object') return null
  const value = result as Partial<CanvasImageNodeResult>
  if (typeof value.status !== 'string') return null
  return {
    status: value.status,
    taskId: typeof value.taskId === 'string' ? value.taskId : undefined,
    images: Array.isArray(value.images)
      ? value.images.filter((path): path is string => typeof path === 'string')
      : [],
    details: Array.isArray(value.details) ? value.details : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
  }
}

export function imageNodeData(node: CanvasNode): CanvasImageNodeData {
  const data = (node.data ?? {}) as Partial<CanvasImageNodeData>
  return {
    prompt: typeof data.prompt === 'string' ? data.prompt : '',
    endpointId: typeof data.endpointId === 'string' ? data.endpointId : '',
    model: typeof data.model === 'string' ? data.model : '',
    aspectRatio: typeof data.aspectRatio === 'string' ? data.aspectRatio : '1:1',
    resolution: typeof data.resolution === 'string' ? data.resolution : '2K',
    count: typeof data.count === 'number' ? data.count : 1,
    style: typeof data.style === 'string' ? data.style : 'unspecified',
    referenceStrength:
      data.referenceStrength === 'low' || data.referenceStrength === 'high'
        ? data.referenceStrength
        : 'medium',
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
