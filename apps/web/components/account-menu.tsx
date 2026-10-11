'use client'

import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

export function AccountMenu() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('登录状态获取失败')))
      .then((data: { authenticated?: boolean; user?: { username?: string } }) => {
        if (data.authenticated && data.user?.username) setUsername(data.user.username)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  function logout() {
    window.localStorage.removeItem('istudio-access-token')
    setUsername('')
    setMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  if (!username) {
    return <Link className="studio-account" href="/login" aria-label="登录我的工作台" title="登录我的工作台">
      <span className="avatar-button"><UserRound size={16} aria-hidden="true" /></span>
      <span className="studio-account-name">登录</span>
    </Link>
  }

  return <div className="account-menu" ref={accountRef} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false)
  }}>
    <button
      ref={triggerRef}
      className="studio-account"
      type="button"
      title={username}
      onClick={() => setMenuOpen(open => !open)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setMenuOpen(true)
          menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
        }
      }}
      aria-label={`${username}的账户菜单`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-controls={menuOpen ? menuId : undefined}
    >
      <span className="avatar-button" aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
      <span className="studio-account-name">{username}</span>
      <ChevronDown className="studio-account-chevron" size={14} aria-hidden="true" />
    </button>
    {menuOpen && <div className="account-dropdown">
      <div className="account-dropdown-identity">{username}</div>
      <div id={menuId} ref={menuRef} role="menu" aria-label="账户操作">
        <button type="button" role="menuitem" onClick={logout}><LogOut size={16} aria-hidden="true" />退出登录</button>
      </div>
    </div>}
  </div>
}
