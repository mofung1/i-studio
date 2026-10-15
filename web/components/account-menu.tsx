'use client'

import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

import { useAccount } from './account-provider'
import { LoginLink } from './login-link'
import { formatCredits, refreshAccount } from '@/lib/credits'

export function AccountMenu() {
  const router = useRouter()
  const { account, loading } = useAccount()
  const username = account.authenticated ? (account.user?.username ?? '') : ''
  const [menuOpen, setMenuOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

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
    refreshAccount()
    setMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  if (!username && loading) {
    return (
      <span className="studio-account account-menu-loading" role="status">
        账户加载中…
      </span>
    )
  }
  if (!username) {
    return (
      <LoginLink className="studio-account" aria-label="登录我的工作台" title="登录我的工作台">
        <span className="avatar-button">
          <UserRound size={16} aria-hidden="true" />
        </span>
        <span className="studio-account-name">登录</span>
      </LoginLink>
    )
  }

  return (
    <div
      className="account-menu"
      ref={accountRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        className="studio-account"
        type="button"
        title={username}
        onClick={() => setMenuOpen((open) => !open)}
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
        <span className="avatar-button" aria-hidden="true">
          {username.slice(0, 1).toUpperCase()}
        </span>
        <span className="studio-account-name">{username}</span>
        <ChevronDown className="studio-account-chevron" size={14} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div className="account-dropdown">
          <div className="account-dropdown-identity">
            {username}
            <div className="account-credit-summary">
              {formatCredits(account.available)} {account.creditName}
            </div>
          </div>
          <div id={menuId} ref={menuRef} role="menu" aria-label="账户操作">
            <Link href="/account" role="menuitem" onClick={() => setMenuOpen(false)}>
              个人中心与余额
            </Link>
            <button type="button" role="menuitem" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
