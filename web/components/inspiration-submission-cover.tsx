'use client'

import { useEffect, useState } from 'react'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

export type SubmissionCoverLoader = (path: string, signal: AbortSignal) => Promise<Blob>
const loadFrontendCover: SubmissionCoverLoader = async (path, signal) => {
  if (!path.startsWith('/v1/personal/inspiration-submissions/')) throw new Error('封面路径无效')
  const token = getAccessToken()
  if (!token) throw new Error('请先登录')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('封面无法读取')
  const blob = await response.blob()
  if (token !== getAccessToken()) throw new Error('账号已切换')
  return blob
}

export function InspirationSubmissionCover({
  path,
  title,
  load = loadFrontendCover,
}: {
  path: string
  title: string
  load?: SubmissionCoverLoader
}) {
  const [source, setSource] = useState<{ path: string; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let url = ''
    setSource(null)
    setFailed(false)
    load(path, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setSource({ path, url })
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, load, attempt])
  return (
    <div className="submission-cover">
      {failed ? (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          封面加载失败，点击重试
        </button>
      ) : source?.path === path ? (
        <img src={source.url} alt={title} />
      ) : (
        <span role="status">正在加载封面…</span>
      )}
    </div>
  )
}
