'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { useAccount } from '@/components/account-provider'

export function MarketingNavigation() {
  const [open, setOpen] = useState(false)
  const navigation = useRef<HTMLElement>(null)
  const menu = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const { account } = useAccount()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (open) navigation.current?.querySelector<HTMLAnchorElement>('a')?.focus()
  }, [open])
  function selectTool(event: MouseEvent<HTMLAnchorElement>, target: string) {
    setOpen(false)
    if (
      pathname === '/' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.button === 0
    ) {
      requestAnimationFrame(() => document.getElementById(target)?.focus({ preventScroll: true }))
    }
  }
  return (
    <header
      className="marketing-header"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          setOpen(false)
          menu.current?.focus()
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <div className="marketing-container marketing-header-inner">
        <Brand />
        <nav
          ref={navigation}
          id="marketing-navigation"
          className="marketing-nav"
          data-open={open}
          aria-label="官网导航"
        >
          <Link
            href="/#ai-tools"
            onClick={(event) => selectTool(event, 'showcase-image-generator')}
          >
            AI 工具
          </Link>
          <Link
            href="/#commerce-tools"
            onClick={(event) => selectTool(event, 'showcase-product-photo')}
          >
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
            ref={menu}
            className="marketing-menu"
            type="button"
            aria-label={open ? '关闭导航' : '打开导航'}
            aria-controls="marketing-navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}
