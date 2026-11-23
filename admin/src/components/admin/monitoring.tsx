'use client'

import Link from '@/routing/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, type OperationalMonitoring } from '@/lib/admin'
import { formatCredits } from '@/lib/credits'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { ArrowUpRight, ChevronDown, RefreshCw } from 'lucide-react'
import { AdminStatusBadge } from './status-badge'
import styles from './overview.module.css'

const issueLabels: Record<string, string> = {
  generation_queue: '生图排队超时',
  reverse_queue: '反推排队超时',
  generation_lease: '生图处理租约过期',
  reverse_lease: '反推处理超时',
  terminal_reservation: '结束或缺失任务未结算',
  aged_reservation: '预留时间过长',
  held_mismatch: '账户预留不一致',
}
const operationLabels: Record<string, string> = {
  save: '写入失败',
  open: '打开失败',
  read: '读取失败',
  delete: '删除失败',
  sign: '签名失败',
}
export const monitoringDuration = (seconds: number) =>
  seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
const clock = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })

export function useAdminMonitoring() {
  const [data, setData] = useState<OperationalMonitoring | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    const timeout = window.setTimeout(() => request.abort(), 10000)
    request.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true })
    try {
      const result = await adminRequest<OperationalMonitoring>(
        'monitoring',
        'GET',
        undefined,
        request.signal,
      )
      if (!request.signal.aborted) {
        setData(result)
        setError('')
      }
    } catch (cause) {
      if (controller.current === request)
        setError(
          cause instanceof TypeError
            ? '无法连接监控服务，请检查 API 或网络后重试'
            : cause instanceof Error && cause.name !== 'AbortError'
              ? cause.message
              : '监控请求超时，请刷新重试',
        )
    } finally {
      window.clearTimeout(timeout)
      if (controller.current === request) {
        controller.current = null
        setLoading(false)
      }
    }
  }, [])
  useEffect(() => {
    void refresh()
    const updateWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const interval = window.setInterval(updateWhenVisible, 30000)
    document.addEventListener('visibilitychange', updateWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', updateWhenVisible)
      const pending = controller.current
      controller.current = null
      pending?.abort()
    }
  }, [refresh])
  return { data, error, loading, refresh }
}

export function AdminMonitoring({
  unit,
  data,
  error,
  loading,
  refresh,
}: ReturnType<typeof useAdminMonitoring> & { unit: string }) {
  const queueAlert =
    !!data &&
    data.generationOverdue +
      data.reverseOverdue +
      data.expiredGenerationLeases +
      data.expiredReverseRuns >
      0
  const reservationAlert =
    !!data && data.terminalReservations + data.agedReservations + data.heldMismatchAccounts > 0
  const storageAlert =
    !!data &&
    data.storageFailures24h + data.deletionRetryPending + data.storageMonitoringDropped > 0
  return (
    <section className={styles.monitor} aria-labelledby="admin-monitor-title">
      <header className={styles.sectionHeading}>
        <div>
          <h2 id="admin-monitor-title">运行监控</h2>
          <p>页面可见时每 30 秒更新。</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />
          {loading ? '刷新中…' : '刷新监控'}
        </Button>
      </header>
      <div aria-busy={loading}>
        {error && (
          <Alert variant="destructive" className={styles.monitorError}>
            <AlertTitle>监控数据未更新</AlertTitle>
            <AlertDescription>
              {error}。当前状态无法确认，以下如有数据为上次成功快照。
            </AlertDescription>
          </Alert>
        )}
        {!data && !error && (
          <p role="status" className={styles.loading}>
            正在读取运行监控…
          </p>
        )}
        {data && (
          <>
            <div className={styles.monitorGroups}>
              <section aria-labelledby="monitor-queue-title" className={styles.monitorGroup}>
                <header>
                  <h3 id="monitor-queue-title">任务积压</h3>
                  <AdminStatusBadge tone={error || queueAlert ? 'warning' : 'neutral'}>
                    {error ? '状态待确认' : queueAlert ? '需关注' : '未见异常'}
                  </AdminStatusBadge>
                </header>
                <dl>
                  <div>
                    <dt>生图排队</dt>
                    <dd>
                      {data.generationQueued} 项<small>超时 {data.generationOverdue} 项</small>
                    </dd>
                  </div>
                  <div>
                    <dt>反推排队</dt>
                    <dd>
                      {data.reverseQueued} 项<small>超时 {data.reverseOverdue} 项</small>
                    </dd>
                  </div>
                </dl>
                <p className={styles.help}>
                  生图最久 {monitoringDuration(data.oldestGenerationWaitSeconds)}；反推最久{' '}
                  {monitoringDuration(data.oldestReverseWaitSeconds)}。排队超过 {data.queueWaitSeconds / 60}{' '}
                  分钟计为超时。
                </p>
                <p className={styles.help}>
                  到期后超过 {data.leaseGraceSeconds} 秒仍未恢复：生图{' '}
                  {data.expiredGenerationLeases} 项，反推 {data.expiredReverseRuns} 项。
                </p>
                <Link href="/admin/tasks">
                  查看生成任务
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </section>
              <section aria-labelledby="monitor-reservation-title" className={styles.monitorGroup}>
                <header>
                  <h3 id="monitor-reservation-title">异常预留</h3>
                  <AdminStatusBadge tone={error || reservationAlert ? 'warning' : 'neutral'}>
                    {error ? '状态待确认' : reservationAlert ? '需核查' : '未见异常'}
                  </AdminStatusBadge>
                </header>
                <dl>
                  <div>
                    <dt>结束或缺失任务未结算</dt>
                    <dd>{data.terminalReservations} 项</dd>
                  </div>
                  <div>
                    <dt>超过时间预算</dt>
                    <dd>{data.agedReservations} 项</dd>
                  </div>
                  <div>
                    <dt>账户预留不一致</dt>
                    <dd>{data.heldMismatchAccounts} 个</dd>
                  </div>
                </dl>
                <p className={styles.help}>
                  时间预算至少 30 分钟，随张数及通道超时增加。只提示核查，不自动退款。
                </p>
                <Link href="/admin/users">
                  查看用户与余额
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </section>
              <section aria-labelledby="monitor-storage-title" className={styles.monitorGroup}>
                <header>
                  <h3 id="monitor-storage-title">存储记录</h3>
                  <AdminStatusBadge tone={error || storageAlert ? 'warning' : 'neutral'}>
                    {error ? '状态待确认' : storageAlert ? '有失败记录' : '未记录失败'}
                  </AdminStatusBadge>
                </header>
                <dl>
                  <div>
                    <dt>最近 24 小时失败</dt>
                    <dd>{data.storageFailures24h} 次</dd>
                  </div>
                  <div>
                    <dt>删除重试待完成</dt>
                    <dd>
                      {data.deletionRetryPending} 项
                      <small>已尝试至少 3 次：{data.deletionRetryRepeated} 项</small>
                    </dd>
                  </div>
                </dl>
                {data.storageMonitoringDropped > 0 && (
                  <p className={styles.monitorWarning}>
                    本进程有 {data.storageMonitoringDropped}{' '}
                    次失败事件未能入库，记录可能不完整，请检查服务日志。
                  </p>
                )}
                <p className={styles.help}>
                  记录服务端实际操作失败；云存储签名链接跳转后的下载结果无法观测。
                </p>
                <Link href="/admin/storage">
                  查看存储配置
                  <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </section>
            </div>

            {data.issues.length > 0 && (
              <details className={styles.diagnostics}>
                <summary>
                  <span>
                    异常定位记录<small>{data.issues.length} 项，最多展示 20 项</small>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <ul>
                  {data.issues.map((issue) => (
                    <li key={`${issue.kind}:${issue.id}`}>
                      <div>
                        <strong>{issueLabels[issue.kind] ?? '待核查'}</strong>
                        <code>{issue.id}</code>
                      </div>
                      <p>
                        {issue.kind === 'held_mismatch'
                          ? `账户 ${formatCredits(issue.heldMinor)} / 应预留 ${formatCredits(issue.expectedHeldMinor)} ${unit}`
                          : `${monitoringDuration(issue.ageSeconds)}${issue.heldMinor > 0 ? `；预留 ${formatCredits(issue.heldMinor)} ${unit}` : ''}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {data.storageFailures.length > 0 && (
              <details className={styles.diagnostics}>
                <summary>
                  <span>
                    最近存储失败<small>24 小时内，最多展示 20 条</small>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <ul>
                  {data.storageFailures.map((failure) => (
                    <li key={failure.id}>
                      <div>
                        <strong>
                          {operationLabels[failure.operation] ?? '存储操作失败'} ·{' '}
                          {failure.backend === 'local' ? '本地' : '云存储'}
                        </strong>
                        <span>{clock(failure.createdAt)}</span>
                        <code>对象摘要：{failure.objectReference}</code>
                      </div>
                      <p>
                        诊断编号<code>{failure.id}</code>
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className={styles.snapshot}>
              快照时间：{clock(data.checkedAt)}
              。监控只读取状态；存储历史失败记录不等于当前仍不可用。
            </p>
          </>
        )}
      </div>
    </section>
  )
}
