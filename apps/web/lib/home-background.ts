import { downscaleImageFile } from './image-file'

/**
 * 首页背景图设置：
 * 默认用内置插画（public/home-bg.jpg），用户自选的背景只压缩后存在本机浏览器
 * （localStorage 的 data URL），不会上传到服务器，也不占后端存储。
 */
const STORAGE_KEY = 'istudio-home-background'
const MAX_EDGE = 1920
const QUALITY = 0.86

/** 读取用户设置的背景图；没有设置或已损坏时返回空字符串（前端回退到默认插画） */
export function readStoredHomeBackground(): string {
  if (typeof window === 'undefined') return ''
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value && value.startsWith('data:image/') ? value : ''
  } catch {
    return ''
  }
}

export function clearStoredHomeBackground() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略：清不掉也不影响使用默认背景
  }
}

/** 压缩后写入本机存储，返回可直接当背景用的 data URL */
export async function storeHomeBackground(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件（JPG / PNG / WebP）')
  const compressed = await downscaleImageFile(file, MAX_EDGE, QUALITY)
  const dataUrl = await readAsDataUrl(compressed)
  try {
    window.localStorage.setItem(STORAGE_KEY, dataUrl)
  } catch {
    throw new Error('这张图片占用的空间太大，换一张小一点的试试')
  }
  return dataUrl
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('图片读取失败，请重试'))
    reader.readAsDataURL(file)
  })
}
