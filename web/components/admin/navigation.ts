import {
  BookOpen,
  Cloud,
  FileText,
  Globe,
  Coins,
  Images,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'

export const adminNavigation = [
  {
    title: '日常运营',
    items: [
      {
        href: '/admin',
        title: '运营概览',
        description: '查看今日任务、额度使用和需要关注的运行情况。',
        icon: LayoutDashboard,
      },
      {
        href: '/admin/users',
        title: '用户与余额',
        description: '查找用户，管理账号状态与站内积分余额。',
        icon: Users,
      },
      {
        href: '/admin/tasks',
        title: '生成任务',
        description: '查看任务进度、生成结果和失败原因，按需排序排查。',
        icon: Images,
      },
      {
        href: '/admin/feedback',
        title: '意见反馈',
        description: '查看反馈内容与截图，跟进并标记处理状态。',
        icon: MessageSquare,
      },
    ],
  },
  {
    title: 'AI 配置',
    items: [
      {
        href: '/admin/settings',
        title: 'AI 服务',
        description: '先连接 AI 服务，再决定各项功能使用哪个模型。',
        icon: Settings2,
      },
      {
        href: '/admin/models',
        title: '模型与定价',
        description: '设置用户可选的生图模型、主渠道与每张图片的积分价格。',
        icon: Coins,
      },
      {
        href: '/admin/prompts',
        title: '系统提示词',
        description: '按功能维护共享指令，切换模板时保留当前页面的编辑草稿。',
        icon: FileText,
      },
    ],
  },
  {
    title: '内容管理',
    items: [
      {
        href: '/admin/inspiration',
        title: '公共灵感库',
        description: '管理公开模板与分类，检查封面、提示词和使用说明后发布。',
        icon: BookOpen,
      },
      {
        href: '/admin/submissions',
        title: '用户投稿审核',
        description: '检查投稿内容，选择发布分类，并按需发放积分奖励。',
        icon: ShieldCheck,
      },
    ],
  },
  {
    title: '网站与系统',
    items: [
      {
        href: '/admin/site',
        title: '网站配置',
        description: '设置网站品牌与联系入口，保存后应用到前台页面。',
        icon: Globe,
      },
      {
        href: '/admin/storage',
        title: '图片存储',
        description: '选择图片保存位置，管理云端连接与访问方式。',
        icon: Cloud,
      },
      {
        href: '/admin/operations',
        title: '运营设置',
        description: '设置注册规则、积分赠送、使用额度和网站公告。',
        icon: ShieldCheck,
      },
      {
        href: '/admin/audit',
        title: '操作日志',
        description: '追踪管理员操作，查看执行时间、操作人、对象与变更内容。',
        icon: ScrollText,
      },
    ],
  },
] as const

export const adminPages = adminNavigation.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title })),
)
export function currentAdminPage(path: string) {
  return [...adminPages]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) => path === item.href || (item.href !== '/admin' && path.startsWith(item.href + '/')),
    )
}
