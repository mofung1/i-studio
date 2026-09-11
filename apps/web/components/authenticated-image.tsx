'use client'

import { useEffect, useState } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface AuthenticatedImageProps {
  path: string
  alt: string
  className?: string
}

export function AuthenticatedImage({ path, alt, className }: AuthenticatedImageProps) {
  const [source, setSource] = useState('')

  useEffect(() => {
    if (!path.startsWith('/')) {
      setSource(path)
      return
    }

    const controller = new AbortController()
    let objectUrl = ''
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
      })
      .catch(() => undefined)

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  if (!source) return <div className={className} aria-label={`${alt}加载中`} />
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
