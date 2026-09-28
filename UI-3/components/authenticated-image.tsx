'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface AuthenticatedImageProps {
  path: string
  alt: string
  className?: string
}

type LoadState = 'loading' | 'loaded' | 'failed'

/**
 * 受保护图片：结果图和素材只走带 token 的请求，因此需要先取 Blob 再转 objectURL。
 * 加载中留出脉冲占位，失败时给出可重试的动作而不是静默空白。
 */
export function AuthenticatedImage({ path, alt, className }: AuthenticatedImageProps) {
  const [source, setSource] = useState('')
  const [state, setState] = useState<LoadState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!path.startsWith('/')) {
      setSource(path)
      setState('loaded')
      return
    }

    const controller = new AbortController()
    let objectUrl = ''
    setState('loading')
    fetch(`${apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('图片加载失败')
        return response.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
        setState('loaded')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setSource('')
        setState('failed')
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, attempt])

  if (state === 'failed') {
    return (
      <div className={['shot-failed', className].filter(Boolean).join(' ')} role="alert" aria-label={`${alt}加载失败`}>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} title="重新加载" aria-label={`重新加载${alt}`}>
          <RefreshCw size={15} />
        </button>
      </div>
    )
  }

  if (state === 'loading' || !source) {
    return <div className={['skeleton', className].filter(Boolean).join(' ')} aria-busy="true" aria-label={`${alt}加载中`} />
  }

  return <img className={className} src={source} alt={alt} />
}

export async function downloadProtectedAsset(path: string, filename: string) {
  const url = path.startsWith('/') ? `${apiBaseUrl}${path}` : path
  const response = await fetch(url, {
    headers: path.startsWith('/') ? { Authorization: `Bearer ${getAccessToken()}` } : undefined,
  })
  if (!response.ok) throw new Error('下载失败')
  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
