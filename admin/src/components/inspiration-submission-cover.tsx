'use client'

import { useEffect, useState } from 'react'
export type SubmissionCoverLoader = (path: string, signal: AbortSignal) => Promise<Blob>
export function InspirationSubmissionCover({
  path,
  title,
  load,
}: {
  path: string
  title: string
  load: SubmissionCoverLoader
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
