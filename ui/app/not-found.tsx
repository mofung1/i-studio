import { ArrowLeft, Compass } from 'lucide-react'
import Link from 'next/link'

import { TopNavigation } from '@/components/top-navigation'

export default function NotFound() {
  return (
    <div className="site-shell">
      <TopNavigation />
      <main className="content-page">
        <div className="route-fallback">
          <div className="route-fallback-icon" aria-hidden="true">
            <Compass size={24} />
          </div>
          <h1>找不到这个页面</h1>
          <p>链接可能已过期，或者页面还没有上线。</p>
          <div className="route-fallback-actions">
            <Link className="primary-action" href="/">
              <ArrowLeft size={15} />返回首页
            </Link>
            <Link className="route-fallback-secondary" href="/workbench">
              前往工作台
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
