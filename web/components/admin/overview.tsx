'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { formatCredits } from '@/lib/credits'
export function AdminOverview({
  overview,
  unit,
}: {
  overview: Record<string, number>
  unit: string
}) {
  return (
    <>
      <div className="ops-stats">
        {[
          ['注册用户', overview.users],
          ['进行中任务', overview.activeTasks],
          ['今日任务', overview.todayTasks],
          ['今日失败任务', overview.todayFailed],
          [`今日消耗${unit}`, formatCredits(overview.todayCharged ?? 0)],
          [`生成中预留${unit}`, formatCredits(overview.held ?? 0)],
        ].map(([name, value]) => (
          <article key={name}>
            <span>{name}</span>
            <strong>{value ?? 0}</strong>
          </article>
        ))}
      </div>
      <section className="ops-card ops-onboarding">
        <h2>开放使用前的准备</h2>
        <ol>
          <li>
            <Link href="/admin/settings">
              配置 AI 服务与系统提示词
              <ArrowUpRight size={14} />
            </Link>
          </li>
          <li>
            <Link href="/admin/models">
              确认模型单价并上架
              <ArrowUpRight size={14} />
            </Link>
          </li>
          <li>
            <Link href="/admin/operations">
              设置积分名称与注册策略
              <ArrowUpRight size={14} />
            </Link>
          </li>
          <li>
            <Link href="/admin/users">
              为用户发放余额
              <ArrowUpRight size={14} />
            </Link>
          </li>
        </ol>
      </section>
    </>
  )
}
