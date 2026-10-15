'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, Settings2, Users, Coins, LayoutDashboard, ScrollText, Images, BookOpen, ShieldCheck, Cloud } from 'lucide-react'
import { useAccount } from '@/components/account-provider'
import { AccountMenu } from '@/components/account-menu'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
const links = [ ['/admin', '运营概览', LayoutDashboard], ['/admin/models', '模型与定价', Coins], ['/admin/users', '用户与余额', Users], ['/admin/settings', 'AI 与网站配置', Settings2], ['/admin/storage', '图片存储', Cloud], ['/admin/operations', '运营设置', ShieldCheck], ['/admin/inspiration', '公共灵感库', BookOpen], ['/admin/tasks', '生成任务', Images], ['/admin/audit', '操作日志', ScrollText] ] as const
export default function AdminLayout({ children }: { children: ReactNode }) {
  const path = usePathname()
  const { account, loading, error, refresh } = useAccount()
  if (loading) return <main className="ops-access" role="status">正在验证后台权限…</main>
  if (error) return <main className="ops-access"><p role="alert">{error}</p><button className="settings-command" onClick={refresh}>重试</button></main>
  if (!account.authenticated) return <main className="ops-access"><ShieldCheck size={28} /><h1>运营后台</h1><p>请使用管理员账号登录。</p><Link className="settings-primary" href={`/login?next=${encodeURIComponent(path)}`}>登录后台</Link><Link href="/">返回前台</Link></main>
  if (account.user?.role !== 'admin') return <main className="ops-access"><ShieldCheck size={28} /><h1>需要管理员权限</h1><p>请联系网站管理员。部署者可通过初始化命令指定管理员。</p><Link className="settings-primary" href="/account">返回个人中心</Link></main>
  return <div className="admin-shell"><aside className="admin-rail"><Brand /><span className="admin-label">运营后台</span><nav aria-label="后台导航">{links.map(([href, name, Icon]) => <Link key={href} href={href} aria-current={path === href || (href !== '/admin' && path.startsWith(href + '/')) ? 'page' : undefined}><Icon size={17} />{name}</Link>)}</nav><Link href="/workbench?mode=general" className="admin-return"><ArrowLeft size={16} />返回创作工作台</Link></aside><header className="admin-topbar"><strong>{links.find(([href]) => href === path)?.[1] ?? '后台配置'}</strong><div><ThemeToggle /><AccountMenu /></div></header><div className="admin-content">{children}</div></div>
}
