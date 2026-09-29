const DEFAULT_MAX_EDGE = 1280
const DEFAULT_QUALITY = 0.85

/**
 * 上传给多模态模型前先压缩：长边不超过 maxEdge、转成 JPEG。
 * 手机原图动辄 5MB，压缩后通常 200~400KB，请求更快也更省 token。
 * 任何一步失败都退回原文件，不影响主流程。
 */
export async function downscaleImageFile(file: File, maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1 && file.size <= 600 * 1024) {
      bitmap.close?.()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close?.()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function downscaleImageFiles(files: File[], maxEdge?: number) {
  return Promise.all(files.map((file) => downscaleImageFile(file, maxEdge)))
}
