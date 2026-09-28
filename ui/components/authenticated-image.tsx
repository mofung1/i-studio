'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface AuthenticatedImageProps {
  path: string
  alt: string
  className?: string
}

type LoadState = 'loading' | 'loaded' | 'failed'

export function AuthenticatedImage({ path, alt, className }: AuthenticatedImageProps) {
  const [source, setSource] = useState('')
  const [state, setState] = useState<LoadState>('loading')
  const [retryToken, setRetryToken] = useState(0)

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
      .catch((error) => {
        // 组件卸载或主动中止时保持安静，不向用户暴露失败态
        if (error.name === 'AbortError') return
        setState('failed')
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, retryToken])

  if (state === 'failed') {
    return (
      <div className={`${className ?? ''} auth-image-failed`} role="alert" aria-label={`${alt}加载失败`}>
        <button
          type="button"
          onClick={() => setRetryToken((token) => token + 1)}
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
