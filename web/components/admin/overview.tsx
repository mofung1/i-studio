'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  Clock3,
  Coins,
  Images,
  MessageSquare,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { formatCredits } from '@/lib/credits'
import styles from './overview.module.css'

function Quota({
  title,
  used,
  limit,
  unit,
  format = String,
  description,
}: {
  title: string
  used?: number
  limit?: number
  unit: string
  format?: (value: number) => string
  description: string
}) {
  const known = used !== undefined && limit !== undefined
  const percentage = known && limit > 0 ? Math.round((used / limit) * 100) : null
  return (
    <div className={styles.quota}>
      <div className={styles.quotaTitle}>
        <strong>{title}</strong>
        <span>{percentage === null ? '—' : `已使用 ${percentage}%`}</span>
      </div>
      <p className={styles.quotaValue}>
        {used === undefined ? '—' : format(used)}
        <span>
          {' '}
          / {limit === undefined ? '—' : format(limit)} {unit}
        </span>
      </p>
      {known && limit > 0 && (
        <progress
          aria-label={`${title}额度使用`}
          value={Math.min(Math.max(used, 0), limit)}
          max={limit}
          data-warning={used >= limit * 0.8}
        />
      )}
      <p className={styles.help}>{description}</p>
    </div>
  )
}

export function AdminOverview({
  overview,
  unit,
  children,
}: {
  overview: Record<string, number>
  unit: string
  children?: ReactNode
}) {
  const number = (key: string) => (overview[key] === undefined ? '—' : String(overview[key]))
  const credits = (key: string) =>
    overview[key] === undefined ? '—' : formatCredits(overview[key])
  const stats = [
    {
      title: '今日提交任务',
      value: number('todayTasks'),
      description: '北京时间今日',
      icon: Images,
      href: '/admin/tasks',
    },
    {
      title: '进行中任务',
      value: number('activeTasks'),
      description: '等待中与生成中',
      icon: Clock3,
      href: '/admin/tasks',
    },
    {
      title: '今日失败任务',
      value: number('todayFailed'),
      description: '查看任务中的失败原因',
      icon: CircleAlert,
      href: '/admin/tasks',
      warning: (overview.todayFailed ?? 0) > 0,
    },
    {
      title: `今日消耗${unit}`,
      value: credits('todayCharged'),
      description: '已结算的站内消耗',
      icon: Coins,
      href: '/admin/tasks',
    },
  ]
  const creditAlert = overview.dailyCreditAlertMinor ?? 0
  const signupBudget = overview.signupGiftDailyBudgetMinor ?? 0
  const auxiliaryLimit = overview.auxiliaryDailyLimit ?? 0
  const notices = [
    creditAlert > 0 && (overview.todayCharged ?? 0) >= creditAlert
      ? {
          text: `今日已结算消耗达到 ${formatCredits(creditAlert)} ${unit}告警阈值。`,
          href: '/admin/operations',
          action: '查看额度设置',
        }
      : null,
    signupBudget > 0 && (overview.signupGiftToday ?? 0) >= signupBudget * 0.8
      ? {
          text: '今日注册赠送预算已使用 80% 或以上；预算不足将暂停新注册。',
          href: '/admin/operations',
          action: '检查注册预算',
        }
      : null,
    auxiliaryLimit > 0 && (overview.auxiliaryToday ?? 0) >= auxiliaryLimit * 0.8
      ? {
          text: '今日辅助请求额度已使用 80% 或以上。',
          href: '/admin/operations',
          action: '查看辅助额度',
        }
      : null,
    (overview.storageFullAccounts ?? 0) > 0
      ? {
          text: `${overview.storageFullAccounts} 个账号已达到存储上限。`,
          href: '/admin/users',
          action: '查看用户',
        }
      : null,
  ].filter((item) => item !== null)

  return (
    <div className={styles.overview}>
      <section aria-label="今日运营数据">
        <dl className={styles.metrics}>
          {stats.map((stat) => (
            <div key={stat.title} className={styles.metric} data-warning={stat.warning}>
              <dt>
                <stat.icon size={16} aria-hidden="true" />
                {stat.title}
              </dt>
              <dd>
                <span className={styles.metricValue}>{stat.value}</span>
                <Link href={stat.href}>
                  <span>{stat.description}</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {notices.length > 0 && (
        <section className={styles.attention} role="alert" aria-label="需要关注">
          <h2>
            <CircleAlert size={17} aria-hidden="true" />
            需要关注
          </h2>
          <ul>
            {notices.map((notice) => (
              <li key={notice.text}>
                <span>{notice.text}</span>
                <Link href={notice.href}>
                  {notice.action}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <p>积分消耗、辅助次数与供应商货币账单分别统计；该提醒不表示真实 API 费用。</p>
        </section>
      )}

      {children}

      <div className={styles.dailyGrid}>
        <section className={styles.panel} aria-labelledby="overview-quota-title">
          <header className={styles.sectionHeading}>
            <div>
              <h2 id="overview-quota-title">今日额度</h2>
              <p>北京时间自然日统计</p>
            </div>
            <Link href="/admin/operations">
              调整额度
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </header>
          <div className={styles.quotas}>
            <Quota
              title="辅助请求"
              used={overview.auxiliaryToday}
              limit={overview.auxiliaryDailyLimit}
              unit="次"
              description={`已开始的请求计数，失败也占次数。当前并发 ${number('auxiliaryActive')} / ${number('auxiliaryConcurrentLimit')}。`}
            />
            <Quota
              title="注册赠送"
              used={overview.signupGiftToday}
              limit={overview.signupGiftDailyBudgetMinor}
              unit={unit}
              format={formatCredits}
              description="按实际入账统计；预算不足会暂停新注册。"
            />
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="overview-actions-title">
          <header className={styles.sectionHeading}>
            <div>
              <h2 id="overview-actions-title">常用操作</h2>
              <p>处理内容、反馈与模型配置</p>
            </div>
          </header>
          <div className={styles.shortcuts}>
            {[
              {
                href: '/admin/submissions',
                title: '审核用户投稿',
                description: '检查待发布的公共灵感',
                icon: ShieldCheck,
              },
              {
                href: '/admin/feedback',
                title: '处理用户反馈',
                description: '跟进问题与处理状态',
                icon: MessageSquare,
              },
              {
                href: '/admin/models',
                title: '管理模型与定价',
                description: '调整主渠道、上架状态和单价',
                icon: Settings2,
              },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <item.icon size={17} aria-hidden="true" />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className={styles.accountSummary} aria-label="平台累计与余额">
        <dl>
          <div>
            <dt>注册用户</dt>
            <dd>
              {number('users')}
              <small> 个账户</small>
            </dd>
          </div>
          <div>
            <dt>全平台可用{unit}</dt>
            <dd>{credits('available')}</dd>
          </div>
          <div>
            <dt>生成中预留{unit}</dt>
            <dd>{credits('held')}</dd>
          </div>
          <div>
            <dt>图片存储</dt>
            <dd>
              {overview.storageBytes === undefined
                ? '—'
                : (overview.storageBytes / 1048576).toFixed(1)}
              <small> MiB</small>
            </dd>
          </div>
        </dl>
        <p>预留积分在任务结束后结算；存储包含暂存及历史引用。以上为站内统计，不代表供应商账单。</p>
      </section>

      <details className={styles.setup}>
        <summary>
          <Settings2 size={17} aria-hidden="true" />
          <span>
            <strong>首次配置与检查</strong>
            <small>从连接 AI 服务到开放用户使用</small>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <ol>
          {[
            {
              href: '/admin/settings',
              title: '连接 AI 渠道',
              description: '添加供应商地址与密钥，验证连接与生图能力。',
            },
            {
              href: '/admin/models',
              title: '发布前台模型',
              description: '绑定主渠道，填写上游模型 ID、价格并上架。',
            },
            {
              href: '/admin/storage',
              title: '确认图片存储',
              description: '按需选择本地存储或配置云存储。',
            },
            {
              href: '/admin/operations',
              title: '设置注册与使用额度',
              description: '检查注册、赠送、并发和存储额度。',
            },
          ].map((item, index) => (
            <li key={item.href}>
              <span>{index + 1}</span>
              <Link href={item.href}>
                <strong>
                  {item.title}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </strong>
                <p>{item.description}</p>
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
