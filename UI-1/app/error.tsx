'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="gate">
      <div className="fallback">
        <AlertCircle size={30} aria-hidden="true" />
        <h1>这一步没有跑通</h1>
        <p>页面渲染时出错了。可以重试，或者先回工作台。</p>
        {error.digest && <p className="mono">错误编号 {error.digest}</p>}
        <div className="fallback-actions">
          <button className="btn btn-primary" type="button" onClick={reset}>
            <RefreshCw size={15} aria-hidden="true" />
            重试
          </button>
          <Link className="btn btn-outline" href="/">
            回到工作台
          </Link>
        </div>
      </div>
    </main>
  )
}
