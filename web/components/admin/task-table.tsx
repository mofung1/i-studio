'use client'

import { formatCredits } from '@/lib/credits'

import type { AdminTask as Task } from '@/lib/admin'
import { AdminDataTable, type AdminColumn, type AdminSortProps } from './data-table'
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
export function AdminTaskTable({
  tasks,
  loading = false,
  sorting,
  onSortingChange,
}: { tasks: Task[]; loading?: boolean } & AdminSortProps) {
  const columns: AdminColumn<Task>[] = [
    {
      id: 'createdAt',
      header: '时间 / 任务',
      size: 205,
      pin: 'left',
      sortable: true,
      cell: (task) => (
        <div className="admin-cell-stack">
          <span>{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
          <span className="admin-cell-secondary" title={task.id}>
            {task.id.slice(0, 12)}
          </span>
        </div>
      ),
    },
    {
      id: 'username',
      header: '用户 / 模型',
      size: 170,
      sortable: true,
      cell: (task) => (
        <div className="admin-cell-stack">
          <strong>{task.username}</strong>
          <span className="admin-cell-secondary">{task.modelName || '历史任务'}</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: '状态',
      size: 130,
      sortable: true,
      cell: (task) => (
        <div className="admin-cell-stack">
          <AdminStatusBadge tone={statusTones[task.status] ?? 'neutral'}>
            {statusLabels[task.status] ?? task.status}
          </AdminStatusBadge>
          {!task.settled && <span className="admin-cell-secondary">等待结算</span>}
        </div>
      ),
    },
    ...(['reserved', 'charged', 'refunded'] as const).map((id) => ({
      id,
      header: { reserved: '预留', charged: '实扣', refunded: '退回' }[id],
      size: 100,
      align: 'right' as const,
      sortable: true,
      cell: (task: Task) => <span className="admin-cell-number">{formatCredits(task[id])}</span>,
    })),
    {
      id: 'message',
      header: '说明',
      size: 270,
      cell: (task) => <span className="admin-cell-message">{task.errorMessage || '—'}</span>,
    },
  ]
  return (
    <AdminDataTable
      title="生成任务列表"
      columns={columns}
      data={tasks}
      getRowId={(task) => task.id}
      loading={loading}
      sorting={sorting}
      onSortingChange={onSortingChange}
      emptyDescription="用户提交生图任务后，可以在这里查看状态与结算。"
    />
  )
}
