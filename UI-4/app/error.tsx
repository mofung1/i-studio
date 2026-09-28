'use client'

import { RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="gate">
      <div className="fallback">
        <h1>这一步没有跑通</h1>
        <p>页面渲染时出错了，可以重试或先回生成页。</p>
        {error.digest && <p className="num">错误编号 {error.digest}</p>}
        <div className="fallback-actions">
          <button className="btn btn-dark" type="button" onClick={reset}>
            <RefreshCw size={15} aria-hidden="true" />
            重试
          </button>
          <Link className="btn btn-outline" href="/">
            回到生成页
          </Link>
        </div>
      </div>
    </main>
  )
}
