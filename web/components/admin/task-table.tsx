'use client'

import { formatCredits } from '@/lib/credits'

import type { AdminTask as Task } from '@/lib/admin'
import { AdminTable as Table } from './table'
import { AdminStatusBadge, type AdminTone } from './status-badge'
const statusTones: Record<string, AdminTone> = {
  queued: 'warning',
  processing: 'warning',
  waiting_provider: 'warning',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  expired: 'danger',
}
const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '生成中',
  waiting_provider: '等待上游',
  succeeded: '生成完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已过期',
}
export function AdminTaskTable({ tasks, loading = false }: { tasks: Task[]; loading?: boolean }) {
  return (
    <section className="ops-card" aria-busy={loading}>
      <Table
        headings={['时间 / 任务', '用户 / 模型', '状态', '预留', '实扣', '退回', '说明']}
        empty={!loading && !tasks.length}
      >
        {loading && !tasks.length && (
          <tr>
            <td colSpan={7} className="ops-empty">
              正在读取任务…
            </td>
          </tr>
        )}
        {tasks.map((task) => (
          <tr key={task.id}>
            <td>
              {new Date(task.createdAt).toLocaleString('zh-CN')}
              <small>{task.id.slice(0, 12)}</small>
            </td>
            <td>
              {task.username}
              <small>{task.modelName || '历史任务'}</small>
            </td>
            <td>
              <AdminStatusBadge tone={statusTones[task.status] ?? 'neutral'}>
                {statusLabels[task.status] ?? task.status}
              </AdminStatusBadge>
              {!task.settled && <small>等待结算</small>}
            </td>
            <td>{formatCredits(task.reserved)}</td>
            <td>{formatCredits(task.charged)}</td>
            <td>{formatCredits(task.refunded)}</td>
            <td className="ops-message-cell">{task.errorMessage || '—'}</td>
          </tr>
        ))}
      </Table>
    </section>
  )
}
