import { Compass } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="gate">
      <div className="fallback">
        <Compass size={30} aria-hidden="true" />
        <h1>这张台面上没有东西</h1>
        <p>链接可能已经过期，或者这个页面还没有建好。</p>
        <div className="fallback-actions">
          <Link className="btn btn-primary" href="/">
            回到工作台
          </Link>
          <Link className="btn btn-outline" href="/assets">
            查看资产库
          </Link>
        </div>
      </div>
    </main>
  )
}
