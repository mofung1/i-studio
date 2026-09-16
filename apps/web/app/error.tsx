'use client'

import { ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'

import { TopNavigation } from '@/components/top-navigation'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="site-shell">
      <TopNavigation />
      <main className="content-page">
        <div className="route-fallback">
          <div className="route-fallback-icon" aria-hidden="true">
            <RefreshCw size={24} />
          </div>
          <h1>页面出错了</h1>
          <p>渲染这个页面时发生了错误。可以重试，或返回上一页继续操作。</p>
          {error.digest && <code className="route-fallback-code">错误编号：{error.digest}</code>}
          <div className="route-fallback-actions">
            <button type="button" className="primary-action" onClick={reset}>
              <RefreshCw size={15} />重试
            </button>
            <Link className="route-fallback-secondary" href="/">
              <ArrowLeft size={15} />返回首页
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
