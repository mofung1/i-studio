'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, type OperationalMonitoring } from '@/lib/admin'
import { formatCredits } from '@/lib/credits'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

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
const duration = (seconds: number) =>
  seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
const clock = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })

export function AdminMonitoring({ unit }: { unit: string }) {
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
    <Card>
      <CardHeader>
        <CardTitle>运行监控</CardTitle>
        <CardDescription>任务积压、异常预留和存储失败。页面可见时每 30 秒更新。</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            刷新监控
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4" aria-busy={loading}>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>监控数据未更新</AlertTitle>
            <AlertDescription>
              {error}。当前状态无法确认，以下如有数据为上次成功快照。
            </AlertDescription>
          </Alert>
        )}
        {!data && !error && <p role="status">正在读取运行监控…</p>}
        {data && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <strong>任务积压</strong>
                  <Badge variant={queueAlert ? 'destructive' : 'secondary'}>
                    {queueAlert ? '需关注' : '未见异常'}
                  </Badge>
                </div>
                <p className="text-sm">
                  生图排队 {data.generationQueued} 项，超过 {data.queueWaitSeconds / 60} 分钟{' '}
                  {data.generationOverdue} 项；最久 {duration(data.oldestGenerationWaitSeconds)}。
                </p>
                <p className="text-sm">
                  反推排队 {data.reverseQueued} 项，超时 {data.reverseOverdue} 项；最久{' '}
                  {duration(data.oldestReverseWaitSeconds)}。
                </p>
                <p className="text-sm">
                  到期后超过 {data.leaseGraceSeconds} 秒仍未恢复：生图{' '}
                  {data.expiredGenerationLeases} 项，反推 {data.expiredReverseRuns} 项。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <strong>异常预留</strong>
                  <Badge variant={reservationAlert ? 'destructive' : 'secondary'}>
                    {reservationAlert ? '需核查' : '未见异常'}
                  </Badge>
                </div>
                <p className="text-sm">
                  结束或缺失任务仍有未结算预留 {data.terminalReservations} 项。
                </p>
                <p className="text-sm">
                  超过任务时间预算的预留 {data.agedReservations} 项；账户与未结算任务预留不一致{' '}
                  {data.heldMismatchAccounts} 个。
                </p>
                <p className="text-xs text-muted-foreground">
                  时间预算至少 30 分钟，随张数及通道超时增加。只提示核查，不自动退款。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <strong>存储失败</strong>
                  <Badge variant={storageAlert ? 'destructive' : 'secondary'}>
                    {storageAlert ? '有失败记录' : '未记录失败'}
                  </Badge>
                </div>
                <p className="text-sm">最近 24 小时失败 {data.storageFailures24h} 次。</p>
                <p className="text-sm">
                  删除重试待完成 {data.deletionRetryPending} 项，其中已尝试至少 3 次{' '}
                  {data.deletionRetryRepeated} 项。
                </p>
                {data.storageMonitoringDropped > 0 && (
                  <p className="text-sm">
                    本进程有 {data.storageMonitoringDropped}{' '}
                    次失败事件未能入库，记录可能不完整，请检查服务日志。
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  记录服务端实际操作失败；云存储签名链接跳转后的下载结果无法观测。
                </p>
              </div>
            </div>
            {data.issues.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm">异常定位记录（最多 20 项）</summary>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>异常</TableHead>
                      <TableHead>任务 / 账户编号</TableHead>
                      <TableHead>时长 / 预留</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.issues.map((issue) => (
                      <TableRow key={`${issue.kind}:${issue.id}`}>
                        <TableCell>{issueLabels[issue.kind] ?? '待核查'}</TableCell>
                        <TableCell>
                          <code>{issue.id}</code>
                        </TableCell>
                        <TableCell>
                          {issue.kind === 'held_mismatch'
                            ? `账户 ${formatCredits(issue.heldMinor)} / 应预留 ${formatCredits(issue.expectedHeldMinor)} ${unit}`
                            : `${duration(issue.ageSeconds)}${issue.heldMinor > 0 ? `；预留 ${formatCredits(issue.heldMinor)} ${unit}` : ''}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            )}
            {data.storageFailures.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm">
                  最近存储失败（24 小时内，最多 20 条）
                </summary>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间 / 操作</TableHead>
                      <TableHead>位置 / 对象摘要</TableHead>
                      <TableHead>诊断编号</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.storageFailures.map((failure) => (
                      <TableRow key={failure.id}>
                        <TableCell>
                          {clock(failure.createdAt)}
                          <br />
                          {operationLabels[failure.operation] ?? '存储操作失败'}
                        </TableCell>
                        <TableCell>
                          {failure.backend === 'local' ? '本地' : '云存储'} /{' '}
                          <code>{failure.objectReference}</code>
                        </TableCell>
                        <TableCell>
                          <code>{failure.id}</code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            )}
            <p className="text-xs text-muted-foreground">
              快照时间：{clock(data.checkedAt)}
              。监控只读取状态；存储历史失败记录不等于当前仍不可用。
            </p>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tasks">查看生成任务</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/storage">查看存储配置</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
