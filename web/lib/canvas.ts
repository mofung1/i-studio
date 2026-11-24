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

/** 从结果图片的 contentPath（如 /v1/assets/{id}/content）取资产 ID，用于图生图引用。 */
export function assetIdFromContentPath(contentPath: string): string | null {
  return contentPath.match(/^\/v1\/assets\/([^/]+)\/content$/)?.[1] ?? null
}

/**
 * 连线类型约束：文本↔图像四种组合均允许（文生文 / 文生图 / 图生图 / 图生文），
 * 仅视频节点不参与连线。图生文是否可用还取决于文本模型是否支持识图（服务端校验）。
 */
export function edgeAllowed(source: CanvasNodeType, target: CanvasNodeType): boolean {
  return source !== 'video' && target !== 'video'
}

const REFERENCE_TOKEN = /@图(\d+)/g

/**
 * 解析生图提示词里的「@图N」精确引用：只把指定序号的上游结果图作为参考图。
 * - 没有 @图N：回退为引用全部上游图（最多 6 张）。
 * - 有 @图N：按 1 起始序号从上游图列表挑图，去掉提示词里的 @图N 标记。
 */
export function resolveReferenceImages(
  prompt: string,
  imageAssetIds: string[],
): { referenceAssetIds: string[]; prompt: string } {
  if (imageAssetIds.length === 0) return { referenceAssetIds: [], prompt }
  const tokens = [...prompt.matchAll(REFERENCE_TOKEN)]
  if (tokens.length === 0) {
    return { referenceAssetIds: imageAssetIds.slice(0, 6), prompt }
  }
  const selected: string[] = []
  for (const token of tokens) {
    const index = Number(token[1]) - 1
    const id = imageAssetIds[index]
    if (id && !selected.includes(id)) selected.push(id)
  }
  return { referenceAssetIds: selected.slice(0, 6), prompt: prompt.replace(REFERENCE_TOKEN, '').trim() }
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
