'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAccount } from '@/components/account-provider'

export function MarketingNavigation() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { account } = useAccount()
  useEffect(() => setOpen(false), [pathname])
  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Brand />
        <nav
          id="marketing-navigation"
          className="marketing-nav"
          data-open={open}
          aria-label="官网导航"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        >
          <Link href="/#ai-tools" onClick={() => setOpen(false)}>
            AI 工具
          </Link>
          <Link href="/#commerce-tools" onClick={() => setOpen(false)}>
            电商工具
          </Link>
          <Link href="/inspiration">灵感广场</Link>
          <Link
            className="marketing-mobile-login"
            href={account.authenticated ? '/studio' : '/login?next=%2Fstudio'}
          >
            {account.authenticated ? '我的工作台' : '登录 / 注册'}
          </Link>
        </nav>
        <div className="marketing-header-actions">
          <ThemeToggle />
          {!account.authenticated && (
            <Link className="marketing-login" href="/login?next=%2Fstudio">
              登录 / 注册
            </Link>
          )}
          <Link href="/studio" className="marketing-button marketing-button-small">
            {account.authenticated ? '进入工作台' : '开始创作'}
          </Link>
          <button
            className="marketing-menu"
            type="button"
            aria-label={open ? '关闭导航' : '打开导航'}
            aria-controls="marketing-navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  )
}
