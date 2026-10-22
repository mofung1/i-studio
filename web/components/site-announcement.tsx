'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { apiBaseUrl } from '@/lib/api'

interface Announcement {
  id: string
  title: string
  content: string
}
export function SiteAnnouncement() {
  const path = usePathname()
  const hidden = path === '/admin' || path.startsWith('/admin/')
  const [notice, setNotice] = useState<Announcement | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (hidden) {
      setNotice(null)
      return
    }
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/operation-settings`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable')
        return response.json()
      })
      .then((data) => {
        if (!controller.signal.aborted) setNotice(data.announcement ?? null)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [hidden])
  useEffect(() => {
    if (!notice || hidden) return
    let seen = false
    try {
      seen = localStorage.getItem('istudio-announcement-seen') === notice.id
    } catch {}
    if (!seen) dialog.current?.showModal()
  }, [notice, hidden])
  function close() {
    if (notice) {
      try {
        localStorage.setItem('istudio-announcement-seen', notice.id)
      } catch {}
    }
    dialog.current?.close()
  }
  if (hidden || !notice) return null
  return (
    <>
      <button
        type="button"
        className="site-announcement-trigger"
        aria-label="查看网站公告"
        onClick={() => dialog.current?.showModal()}
      >
        <Bell size={17} aria-hidden="true" />
        <span>公告</span>
      </button>
      <dialog
        className="site-announcement-dialog"
        ref={dialog}
        aria-labelledby="site-announcement-title"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <div className="site-announcement-heading">
          <span>网站公告</span>
          <button type="button" aria-label="关闭公告" onClick={close}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <h2 id="site-announcement-title">{notice.title}</h2>
        <div className="site-announcement-body">{notice.content}</div>
        <button type="button" className="studio-primary" onClick={close}>
          我知道了
        </button>
      </dialog>
    </>
  )
}
