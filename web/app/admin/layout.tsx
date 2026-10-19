'use client'
import './admin.css'
import './data-table.css'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { AdminAccountProvider, useAdminAccount } from '@/components/account-provider'
import { OverlayRoot } from '@/components/overlay-root'
import { AdminWorkspaceShell } from '@/components/admin/workspace'
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
    <OverlayRoot className="admin-shell">
      <a className="skip-link" href="#admin-main">
        跳至主要内容
      </a>
      <AdminWorkspaceShell>{children}</AdminWorkspaceShell>
    </OverlayRoot>
  )
}
