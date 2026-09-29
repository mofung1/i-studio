'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface AuthenticatedImageProps {
  path: string
  alt: string
  className?: string
}

type LoadState = 'loading' | 'loaded' | 'failed'

interface CacheEntry {
  url: string
  blob: Blob
}

/**
 * 受保护图片的进程内缓存。
 * 同一次生成的多张图会被缩略图条、主图、历史抽屉等多个组件同时请求，
 * 缓存 + 单飞（inflight 去重）能让「点下一张」直接命中已有图片，不再重新 fetch，
 * 也就不会出现"旧图先消失、新图再出现"的闪白。
 */
const CACHE_LIMIT = 120
const imageCache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CacheEntry>>()

function remember(path: string, entry: CacheEntry) {
  imageCache.set(path, entry)
  if (imageCache.size <= CACHE_LIMIT) return
  // 超出上限时按插入顺序淘汰最旧的一批
  const overflow = imageCache.size - CACHE_LIMIT
  let index = 0
  for (const [key, value] of imageCache) {
    if (index >= overflow) break
    imageCache.delete(key)
    URL.revokeObjectURL(value.url)
    index += 1
  }
}

/** 取受保护图片（带缓存与请求去重）；失败时抛出，由调用方决定展示什么 */
export async function loadProtectedImage(path: string): Promise<CacheEntry> {
  if (!path.startsWith('/')) return { url: path, blob: new Blob() }
  const cached = imageCache.get(path)
  if (cached) return cached
  const pending = inflight.get(path)
  if (pending) return pending

  const request = (async () => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
    if (!response.ok) throw new Error('图片加载失败')
    const blob = await response.blob()
    const entry: CacheEntry = { url: URL.createObjectURL(blob), blob }
    remember(path, entry)
    return entry
  })()
  inflight.set(path, request)
  try {
    return await request
  } finally {
    inflight.delete(path)
  }
}

/**
 * 取受保护图片的对象 URL。
 * 切换 path 时会保留上一张已经加载好的图，直到新图就绪再替换，
 * 所以连续浏览多张结果图不会闪白、也不会出现容器尺寸跳变。
 *
 * resetKey 用于区分「一组结果」：同一次生成的多张图属于同一组，
 * 组内切换保留上一张；换组（新的一次生成、另一条历史记录）则不保留，
 * 避免新图未到达时先显示上一组已经过期的画面。
 */
export function useProtectedImageUrl(path: string, resetKey?: string) {
  const cached = path.startsWith('/') ? imageCache.get(path) : { url: path, blob: new Blob() }
  const [source, setSource] = useState(cached?.url ?? '')
  const [state, setState] = useState<LoadState>(cached ? 'loaded' : path.startsWith('/') ? 'loading' : 'loaded')
  const [retryToken, setRetryToken] = useState(0)
  const hasSource = useRef(Boolean(cached?.url || !path.startsWith('/')))
  const activeGroup = useRef(resetKey)

  useEffect(() => {
    let active = true

    if (resetKey !== undefined && activeGroup.current !== resetKey) {
      activeGroup.current = resetKey
      hasSource.current = false
      setSource('')
      setState('loading')
    }

    if (!path.startsWith('/')) {
      hasSource.current = true
      setSource(path)
      setState('loaded')
      return
    }

    const hit = retryToken === 0 ? imageCache.get(path) : undefined
    if (hit) {
      hasSource.current = true
      setSource(hit.url)
      setState('loaded')
      return
    }
    // 关键：不清空 source，让上一张图继续显示，避免中间出现空白帧
    if (!hasSource.current) setState('loading')

    loadProtectedImage(path)
      .then((entry) => {
        if (!active) return
        hasSource.current = true
        setSource(entry.url)
        setState('loaded')
      })
      .catch(() => {
        if (active) setState('failed')
      })

    return () => {
      active = false
    }
  }, [path, resetKey, retryToken])

  const retry = () => {
    if (path.startsWith('/')) imageCache.delete(path)
    setRetryToken((token) => token + 1)
  }

  return { source, state, retry }
}

export function AuthenticatedImage({ path, alt, className }: AuthenticatedImageProps) {
  const { source, state, retry } = useProtectedImageUrl(path)

  if (state === 'failed') {
    return (
      <div className={`${className ?? ''} auth-image-failed`} role="alert" aria-label={`${alt}加载失败`}>
        <button
          type="button"
          onClick={retry}
          aria-label={`重试加载${alt}`}
          title="重新加载"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    )
  }

  if (state === 'loading' || !source) {
    return <div className={`${className ?? ''} auth-image-loading`} aria-label={`${alt}加载中`} />
  }
  return <img className={className} src={source} alt={alt} />
}

export async function downloadProtectedAsset(path: string, filename: string) {
  let blob: Blob
  const cached = path.startsWith('/') ? imageCache.get(path) : undefined
  if (cached) {
    // 命中缓存就不再重复下载一次
    blob = cached.blob
  } else if (path.startsWith('/')) {
    blob = (await loadProtectedImage(path)).blob
  } else {
    const response = await fetch(path)
    if (!response.ok) throw new Error('下载失败')
    blob = await response.blob()
  }
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
