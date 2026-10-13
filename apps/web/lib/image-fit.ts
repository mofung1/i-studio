/** Contain an image in the available viewport, retaining its aspect ratio. */
export function containImage(width: number, height: number, aspectRatio: number) {
  const availableWidth = Number.isFinite(width) ? Math.max(0, width) : 0
  const availableHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  const imageWidth = Math.min(availableWidth, availableHeight * ratio)
  return { width: imageWidth, height: imageWidth / ratio }
}
