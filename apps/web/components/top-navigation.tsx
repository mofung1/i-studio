import { Bell, Coins } from 'lucide-react'
import Link from 'next/link'

import { Brand } from './brand'

export function TopNavigation() {
  return (
    <header className="top-navigation">
      <Brand />
      <nav aria-label="主导航">
        <Link href="/workbench?mode=general">AI 图片</Link>
        <Link href="/workbench?mode=commerce&task=white-background">电商工具</Link>
        <Link href="/#inspiration">发现灵感</Link>
        <Link href="/#projects">项目</Link>
        <Link href="/#assets">资产</Link>
      </nav>
      <div className="nav-actions">
        <span className="credit-badge"><Coins size={16} />1,280</span>
        <button className="icon-button" type="button" aria-label="通知"><Bell size={19} /></button>
        <button className="avatar-button" type="button" aria-label="账户菜单">M</button>
      </div>
    </header>
  )
}

