'use client'

import { Bell, Coins } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Brand } from './brand'

export function TopNavigation() {
  const router = useRouter()

  function handleAccountClick() {
    const token = window.localStorage.getItem('istudio-access-token')
    router.push(token ? '/projects' : '/login')
  }

  return (
    <header className="top-navigation">
      <Brand />
      <nav aria-label="主导航">
        <Link href="/workbench?mode=general">AI 图片</Link>
        <Link href="/workbench?mode=commerce&task=white-background">电商工具</Link>
        <Link href="/#inspiration">发现灵感</Link>
        <Link href="/tasks">任务</Link>
        <Link href="/projects">项目与资产</Link>
      </nav>
      <div className="nav-actions">
        <span className="credit-badge"><Coins size={16} />1,280</span>
        <button className="icon-button" type="button" aria-label="通知"><Bell size={19} /></button>
        <button className="avatar-button" type="button" onClick={handleAccountClick} aria-label="账户">M</button>
      </div>
    </header>
  )
}
