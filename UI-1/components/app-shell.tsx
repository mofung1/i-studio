'use client'

import { Compass, Images, LayoutGrid, ListChecks, LogIn } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { RegMark } from './brand'

const navItems = [
  { href: '/', label: '工作台', icon: LayoutGrid, match: (path: string) => path === '/' || path.startsWith('/workbench') },
  { href: '/assets', label: '资产库', icon: Images, match: (path: string) => path.startsWith('/assets') },
  { href: '/inspire', label: '灵感库', icon: Compass, match: (path: string) => path.startsWith('/inspire') },
  { href: '/tasks', label: '任务记录', icon: ListChecks, match: (path: string) => path.startsWith('/tasks') },
] as const

export function AppShell({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="主导航">
        <Link className="rail-brand" href="/" aria-label="iStudio 工作台">
          <RegMark />
        </Link>
        <span className="rail-rule" aria-hidden="true" />
        {navItems.map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            className="rail-item"
            href={href}
            aria-current={match(pathname) ? 'page' : undefined}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <div className="rail-foot">
          <AccountMenu />
        </div>
      </nav>
      <main className="app-main">
        {bar}
        {children}
      </main>
    </div>
  )
}

export function ServiceState({ aiEnabled }: { aiEnabled: boolean | null }) {
  const state = aiEnabled === null ? 'checking' : aiEnabled ? 'ready' : 'off'
  const label = aiEnabled === null ? '探测 AI 服务' : aiEnabled ? 'AI 服务就绪' : 'AI 服务未配置'

  return (
    <span className="svc-state" data-state={state} title={label} role="status">
      <i aria-hidden="true" />
      {label}
    </span>
  )
}

export function AccountMenu() {
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
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('登录状态获取失败'))))
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

  if (!ready) {
    return <span className="rail-user is-idle" aria-hidden="true" />
  }

  if (!username) {
    return (
      <Link className="rail-user is-guest" href="/login" aria-label="登录" title="登录">
        <LogIn size={17} />
      </Link>
    )
  }

  return (
    <div className="account" ref={holder}>
      <button
        className="rail-user"
        type="button"
        aria-label={`${username} 的账户`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {username.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="account-menu up" role="menu">
          <span>{username}</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              window.localStorage.removeItem('istudio-access-token')
              setOpen(false)
              router.push('/')
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
