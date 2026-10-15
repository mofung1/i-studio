'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { AccountMenu } from './account-menu'

import { Brand } from './brand'

export function TopNavigation() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <header className="top-navigation">
      <Brand />
      <button
        className="nav-toggle"
        type="button"
        aria-label={navOpen ? '关闭导航' : '打开导航'}
        aria-expanded={navOpen}
        aria-controls="primary-navigation"
        onClick={() => setNavOpen((open) => !open)}
      >
        {navOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav id="primary-navigation" aria-label="主导航" data-open={navOpen}>
        <Link href="/workbench?mode=general" onClick={() => setNavOpen(false)}>
          AI 生图
        </Link>
        <Link href="/commerce" onClick={() => setNavOpen(false)}>
          电商工具
        </Link>
        <Link href="/inspire" onClick={() => setNavOpen(false)}>
          灵感
        </Link>
        <Link href="/assets" onClick={() => setNavOpen(false)}>
          资产库
        </Link>
        <Link href="/account" onClick={() => setNavOpen(false)}>
          个人中心
        </Link>
      </nav>
      <div className="nav-actions">
        <AccountMenu />
      </div>
    </header>
  )
}
