'use client'

import { ImagePlus, Images, LayoutGrid, LogIn, Sparkles, Wand2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { BrandMark } from '@/components/brand'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface RailEntry {
  key: string
  label: string
  icon: typeof LayoutGrid
  href?: string
  match?: (path: string) => boolean
}

/** 这一版只交付生成页，未设计的入口保留位置但不假装可用。 */
const railEntries: RailEntry[] = [
  { key: 'generate', label: '生成', icon: Wand2, href: '/', match: (path) => path === '/' || path.startsWith('/workbench') },
  { key: 'retouch', label: '精修（待设计）', icon: ImagePlus },
  { key: 'assets', label: '素材库（待设计）', icon: Images },
  { key: 'inspire', label: '灵感（待设计）', icon: Sparkles },
]

export function AppShell({ topbar, children }: { topbar: ReactNode; children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="studio">
      <div className="shell">
        <nav className="rail" aria-label="主导航">
          <Link className="rail-brand" href="/" aria-label="iStudio 生成工作台">
            <BrandMark />
            <span className="rail-brand-text"><strong>iStudio</strong><small>AI 视觉工作台</small></span>
          </Link>
          <div className="rail-section-label">工作台</div>
          {railEntries.map(({ key, label, icon: Icon, href, match }) =>
            href ? (
              <Link
                className="rail-item"
                href={href}
                key={key}
                aria-label={label}
                aria-current={match?.(pathname) ? 'page' : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="rail-tip">{label}</span>
              </Link>
            ) : (
              <button
                className="rail-item"
                key={key}
                type="button"
                disabled
                aria-disabled="true"
                aria-label={label}
                title={`${label} —— 这一版先做生成页`}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="rail-tip">{label}</span>
              </button>
            ),
          )}
          <div className="rail-foot">
            <span className="rail-foot-orb" aria-hidden="true" />
            <span><strong>创作空间</strong><small>Pro workspace</small></span>
          </div>
        </nav>
        <main className="main">
          {topbar}
          {children}
        </main>
      </div>
    </div>
  )
}

export function ServicePill({ aiEnabled }: { aiEnabled: boolean | null }) {
  const state = aiEnabled === null ? 'checking' : aiEnabled ? 'ready' : 'off'
  const label = aiEnabled === null ? '检测 AI 服务' : aiEnabled ? 'AI 服务就绪' : 'AI 服务未配置'

  return (
    <span className="pill" data-state={state} role="status" title={label}>
      <i aria-hidden="true" />
      {label}
    </span>
  )
}

/** 参考图的右上角：头像 + 名字的胶囊。 */
export function AccountChip() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setReady(true)
      return
    }
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('无法获取登录状态'))))
      .then((data: { authenticated?: boolean; user?: { username?: string } }) => {
        if (data.authenticated && data.user?.username) setUsername(data.user.username)
      })
      .catch(() => undefined)
      .finally(() => setReady(true))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!ready) return <span className="skeleton" style={{ width: 92, height: 34, borderRadius: 999 }} aria-hidden="true" />

  if (!username) {
    return (
      <Link className="btn btn-outline btn-sm" href="/login">
        <LogIn size={14} aria-hidden="true" />
        登录 / 注册
      </Link>
    )
  }

  return (
    <div ref={holder} style={{ position: 'relative' }}>
      <button
        className="account-chip"
        type="button"
        aria-label={`${username} 的账户`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <i aria-hidden="true">{username.slice(0, 1).toUpperCase()}</i>
        {username}
      </button>
      {open && (
        <div className="menu" role="menu">
          <span>{username}</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              window.localStorage.removeItem('istudio-access-token')
              setOpen(false)
              router.push('/login')
              router.refresh()
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
