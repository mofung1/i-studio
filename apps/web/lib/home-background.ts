import { downscaleImageFile } from './image-file'

/**
 * 首页背景图设置：
 * 默认没有背景图（只有主题底色），用户自选的背景只压缩后存在本机浏览器
 * （localStorage 的 data URL），不会上传到服务器，也不占后端存储。
 */
const STORAGE_KEY = 'istudio-home-background'
const THEME_KEY = 'istudio-home-theme'
const MAX_EDGE = 1920
const QUALITY = 0.86

/** 首页 hero 的配色模式（仅作用于首页，不影响工作台等其它页面） */
export type HomeTheme = 'light' | 'dark'

/** 读取用户选择的首页配色；没存过默认深色 */
export function readStoredHomeTheme(): HomeTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function storeHomeTheme(theme: HomeTheme) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // 忽略：存不上也不影响本次使用
  }
}

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
