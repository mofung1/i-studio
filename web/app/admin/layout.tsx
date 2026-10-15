'use client'
import './admin.css'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  Settings2,
  Users,
  Coins,
  LayoutDashboard,
  ScrollText,
  Images,
  BookOpen,
  ShieldCheck,
  Cloud,
} from 'lucide-react'
import { AdminAccountProvider, useAdminAccount } from '@/components/account-provider'
import { getAdminAccessToken } from '@/lib/api'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
const links = [
  ['/admin', '运营概览', LayoutDashboard],
  ['/admin/models', '模型与定价', Coins],
  ['/admin/users', '用户与余额', Users],
  ['/admin/settings', 'AI 与网站配置', Settings2],
  ['/admin/storage', '图片存储', Cloud],
  ['/admin/operations', '运营设置', ShieldCheck],
  ['/admin/inspiration', '公共灵感库', BookOpen],
  ['/admin/tasks', '生成任务', Images],
  ['/admin/audit', '操作日志', ScrollText],
] as const
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAccountProvider>
      <AdminWorkspace>{children}</AdminWorkspace>
    </AdminAccountProvider>
  )
}
function AdminWorkspace({ children }: { children: ReactNode }) {
  const path = usePathname()
  const { account, loading, error, refresh } = useAdminAccount()
  if (path === '/admin/login') return children
  if (loading)
    return (
      <main className="ops-access" role="status">
        正在验证后台权限…
      </main>
    )
  if (error)
    return (
      <main className="ops-access">
        <p role="alert">{error}</p>
        <button className="settings-command" onClick={refresh}>
          重试
        </button>
      </main>
    )
  if (!account.authenticated)
    return (
      <main className="ops-access">
        <ShieldCheck size={28} />
        <h1>运营后台</h1>
        <p>请使用管理员账号登录。</p>
        <Link className="settings-primary" href={`/admin/login?next=${encodeURIComponent(path)}`}>
          登录后台
        </Link>
        <Link href="/">返回前台</Link>
      </main>
    )
  if (account.user?.role !== 'admin')
    return (
      <main className="ops-access">
        <ShieldCheck size={28} />
        <h1>需要管理员权限</h1>
        <p>请联系网站管理员。部署者可通过初始化命令指定管理员。</p>
        <Link className="settings-primary" href="/account">
          返回个人中心
        </Link>
      </main>
    )
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        跳至主要内容
      </a>
      <aside className="admin-rail">
        <Brand />
        <span className="admin-label">运营后台</span>
        <nav aria-label="后台导航">
          {links.map(([href, name, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={
                path === href || (href !== '/admin' && path.startsWith(href + '/'))
                  ? 'page'
                  : undefined
              }
            >
              <Icon size={17} />
              {name}
            </Link>
          ))}
        </nav>
        <Link href="/workbench?mode=general" className="admin-return">
          <ArrowLeft size={16} />
          返回创作工作台
        </Link>
      </aside>
      <header className="admin-topbar">
        <strong>{links.find(([href]) => href === path)?.[1] ?? '后台配置'}</strong>
        <div>
          <ThemeToggle />
          <span className="admin-session-name">{account.user?.username}</span>
          <button
            className="settings-command"
            onClick={() => {
              if (getAdminAccessToken()) window.localStorage.removeItem('istudio-admin-token')
              refresh()
            }}
          >
            退出后台
          </button>
        </div>
      </header>
      <div className="admin-content" id="admin-main" tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}
