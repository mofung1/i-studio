export interface ComparisonImage {
  path: string
  label: string
  width?: number
  height?: number
}
export interface ComparisonPan { x: number; y: number }
export const comparisonZoomSteps = [1, 1.25, 1.5, 2, 3, 4, 6, 8]
export function clampComparisonZoom(value: number) {
  return Number.isFinite(value) ? Math.min(8, Math.max(1, value)) : 1
}
export function clampComparisonPan(pan: ComparisonPan, zoom: number): ComparisonPan {
  const limit = (clampComparisonZoom(zoom) - 1) / 2
  if (limit === 0) return { x: 0, y: 0 }
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0
  return { x: clamp(pan.x), y: clamp(pan.y) }
}
export function comparisonDivider(clientX: number, left: number, width: number) {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) return 50
  return Math.min(100, Math.max(0, ((clientX - left) / width) * 100))
}
export function comparisonReferences(input?: {
  productAssetIds?: string[]; referenceAssetIds?: string[]; modelAssetId?: string; sceneAssetId?: string
}): ComparisonImage[] {
  if (!input) return []
  const asset = (id: string, label: string) => ({ path: `/v1/assets/${id}/content`, label })
  return comparisonCandidates([
    ...(input.productAssetIds ?? []).map((id, index) => asset(id, `商品原图 ${index + 1}`)),
    ...(input.referenceAssetIds ?? []).map((id, index) => asset(id, `参考原图 ${index + 1}`)),
    ...(input.modelAssetId ? [asset(input.modelAssetId, '模特参考图')] : []),
    ...(input.sceneAssetId ? [asset(input.sceneAssetId, '场景参考图')] : []),
  ])
}
export function comparisonCandidates(items: ComparisonImage[]) {
  const seen = new Set<string>()
  return items.filter(item => {
    if (!item.path || seen.has(item.path)) return false
    const privatePath = /^\/v1\/assets\/[A-Za-z0-9_-]+\/content$/.test(item.path)
    let publicPath = false
    try { const url = new URL(item.path); publicPath = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { /* Relative paths require an authenticated asset route. */ }
    if (!privatePath && !publicPath) return false
    seen.add(item.path)
    return true
  }).map((item, index) => ({ ...item, label: item.label.trim().slice(0, 100) || `图片 ${index + 1}` }))
}
