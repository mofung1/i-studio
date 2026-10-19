'use client'
import Link from 'next/link'
import { ArrowUpRight, Clock3, Coins, Images, ShieldCheck, Users, Wallet } from 'lucide-react'
import { formatCredits } from '@/lib/credits'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'
import { Button } from './ui/button'

export function AdminOverview({
  overview,
  unit,
}: {
  overview: Record<string, number>
  unit: string
}) {
  const stats = [
    { title: '注册用户', value: overview.users ?? 0, description: '平台累计注册账户', icon: Users },
    {
      title: '今日任务',
      value: overview.todayTasks ?? 0,
      description: '今日提交的生图任务',
      icon: Images,
    },
    {
      title: '进行中任务',
      value: overview.activeTasks ?? 0,
      description: '等待中与生成中的任务',
      icon: Clock3,
    },
    {
      title: `今日消耗${unit}`,
      value: formatCredits(overview.todayCharged ?? 0),
      description: '按现有任务结算规则统计',
      icon: Coins,
    },
    {
      title: `生成中预留${unit}`,
      value: formatCredits(overview.held ?? 0),
      description: '任务完成或失败后结算',
      icon: Wallet,
    },
    {
      title: '今日失败任务',
      value: overview.todayFailed ?? 0,
      description: '可在生成任务中查看错误',
      icon: ShieldCheck,
    },
  ]
  return (
    <>
      <div className="admin-overview-stats">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader>
              <CardDescription>{stat.title}</CardDescription>
              <CardAction>
                <stat.icon className="size-4 text-muted-foreground" />
              </CardAction>
              <CardTitle className="sr-only">{stat.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="admin-overview-stat">{stat.value}</div>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className="admin-overview-panels">
        <Card>
          <CardHeader>
            <CardTitle>开放使用前的准备</CardTitle>
            <CardDescription>按顺序连接 AI 服务、发布模型并配置运营策略。</CardDescription>
          </CardHeader>
          <CardContent>
            {[
              [
                '/admin/settings',
                '01',
                '连接 AI 渠道',
                '添加官方接口或兼容中转站，检查连接与生图能力。',
              ],
              [
                '/admin/models',
                '02',
                '发布公共模型',
                '设置前台名称、积分价格、上游模型 ID 和主渠道。',
              ],
              ['/admin/storage', '03', '确认图片存储', '选择本地存储或已有对象存储配置。'],
              [
                '/admin/operations',
                '04',
                '设置注册与使用策略',
                '配置积分名称、注册赠送和单用户任务上限。',
              ],
            ].map(([href, index, title, description]) => (
              <Link key={href} href={href!} className="admin-setup-link">
                <span className="flex items-center gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    {index}
                  </span>
                  <span>
                    <strong className="text-sm font-medium">{title}</strong>
                    <p>{description}</p>
                  </span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>任务与余额</CardTitle>
            <CardDescription>查看当前任务处理情况和平台可用余额。</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <div className="admin-task-metric">
                <dt>今日提交</dt>
                <dd>{overview.todayTasks ?? 0} 个任务</dd>
              </div>
              <div className="admin-task-metric">
                <dt>等待与生成中</dt>
                <dd>{overview.activeTasks ?? 0} 个任务</dd>
              </div>
              <div className="admin-task-metric">
                <dt>今日失败</dt>
                <dd>{overview.todayFailed ?? 0} 个任务</dd>
              </div>
              <div className="admin-task-metric">
                <dt>全平台可用{unit}</dt>
                <dd>{formatCredits(overview.available ?? 0)}</dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter className="mt-auto gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/tasks">
                查看生成任务
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/users">管理用户余额</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  )
}
