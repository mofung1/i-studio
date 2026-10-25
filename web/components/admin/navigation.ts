import {
  BookOpen,
  Cloud,
  FileText,
  Globe,
  Coins,
  Images,
  LayoutDashboard,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'

export const adminNavigation = [
  {
    title: '工作空间',
    items: [
      {
        href: '/admin',
        title: '运营概览',
        icon: LayoutDashboard,
      },
      { href: '/admin/users', title: '用户与余额', icon: Users },
      { href: '/admin/tasks', title: '生成任务', icon: Images },
    ],
  },
  {
    title: 'AI 与内容',
    items: [
      {
        href: '/admin/models',
        title: '模型与定价',
        icon: Coins,
      },
      {
        href: '/admin/settings',
        title: 'AI 服务',
        icon: Settings2,
      },
      {
        href: '/admin/prompts',
        title: '系统提示词',
        icon: FileText,
      },
      {
        href: '/admin/inspiration',
        title: '公共灵感库',
        icon: BookOpen,
      },
      { href: '/admin/submissions', title: '用户投稿审核', icon: ShieldCheck },
    ],
  },
  {
    title: '系统管理',
    items: [
      {
        href: '/admin/site',
        title: '网站配置',
        icon: Globe,
      },
      { href: '/admin/storage', title: '图片存储', icon: Cloud },
      {
        href: '/admin/operations',
        title: '运营设置',
        icon: ShieldCheck,
      },
      { href: '/admin/audit', title: '操作日志', icon: ScrollText },
    ],
  },
] as const

export const adminPages = adminNavigation.flatMap((group) => [...group.items])
export function currentAdminPage(path: string) {
  return [...adminPages]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) => path === item.href || (item.href !== '/admin' && path.startsWith(item.href + '/')),
    )
}
