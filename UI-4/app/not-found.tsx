import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="gate">
      <div className="fallback">
        <h1>这个页面还没做</h1>
        <p>这一版先交付了生成页与登录注册页，其它入口还在排队。</p>
        <div className="fallback-actions">
          <Link className="btn btn-dark" href="/">
            回到生成页
          </Link>
          <Link className="btn btn-outline" href="/login">
            登录 / 注册
          </Link>
        </div>
      </div>
    </main>
  )
}
