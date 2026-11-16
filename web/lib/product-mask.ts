export type MaskPoint = { x: number; y: number }
export type MaskMark =
  | { kind: 'brush'; points: MaskPoint[]; width: number }
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }

export function maskPoint(
  clientX: number,
  clientY: number,
  box: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  width: number,
  height: number,
): MaskPoint {
  return {
    x: Math.max(0, Math.min(width, ((clientX - box.left) * width) / Math.max(1, box.width))),
    y: Math.max(0, Math.min(height, ((clientY - box.top) * height) / Math.max(1, box.height))),
  }
}

/** Preview and exported alpha mask share the exact same geometry. */
export function paintMask(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  marks: MaskMark[],
  exportMask = false,
) {
  context.clearRect(0, 0, width, height)
  context.save()
  if (exportMask) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'destination-out'
  }
  context.fillStyle = exportMask ? '#000000' : 'rgba(238, 155, 25, 0.48)'
  context.strokeStyle = context.fillStyle
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const mark of marks) {
    if (mark.kind === 'rectangle') {
      context.fillRect(mark.x, mark.y, mark.width, mark.height)
      continue
    }
    if (!mark.points.length) continue
    context.lineWidth = mark.width
    context.beginPath()
    context.arc(mark.points[0]!.x, mark.points[0]!.y, mark.width / 2, 0, Math.PI * 2)
    context.fill()
    if (mark.points.length > 1) {
      context.beginPath()
      context.moveTo(mark.points[0]!.x, mark.points[0]!.y)
      for (const point of mark.points.slice(1)) context.lineTo(point.x, point.y)
      context.stroke()
    }
  }
  context.restore()
}

export async function exportProductMask(
  width: number,
  height: number,
  marks: MaskMark[],
): Promise<File> {
  if (!marks.length || width <= 0 || height <= 0) throw new Error('请先选择要修改的区域')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器暂不支持选区编辑，请更换浏览器后重试')
  paintMask(context, width, height, marks, true)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('选区保存失败，请重试')
  return new File([blob], 'product-edit-mask.png', { type: 'image/png' })
}
