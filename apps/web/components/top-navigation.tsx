'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

import { Brand } from './brand'

export function TopNavigation() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

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

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
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

  return (
    <header className="top-navigation">
      <Brand />
      <nav aria-label="主导航">
        <Link href="/workbench?mode=general">AI 图片</Link>
        <Link href="/workbench?mode=commerce&task=white-background">电商工具</Link>
        <Link href="/#inspiration">发现灵感</Link>
        <Link href="/tasks">任务</Link>
        <Link href="/projects">项目</Link>
      </nav>
      <div className="nav-actions">
        {username ? <div className="account-menu" ref={accountRef}>
          <button className="avatar-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={`${username}的账户菜单`} aria-haspopup="menu" aria-expanded={menuOpen}>{username.slice(0, 1).toUpperCase()}</button>
          {menuOpen && <div className="account-dropdown" role="menu">
            <span>{username}</span>
            <button type="button" role="menuitem" onClick={logout}>退出登录</button>
          </div>}
        </div> : <Link className="login-button" href="/login">登录</Link>}
      </div>
    </header>
  )
}
