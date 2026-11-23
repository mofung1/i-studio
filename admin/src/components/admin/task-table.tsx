'use client'

import { formatCredits } from '@/lib/credits'

import type { AdminTask as Task } from '@/lib/admin'
import {
  AdminCellText,
  AdminDataTable,
  type AdminColumn,
  type AdminSortProps,
  type AdminTableToolbarProps,
} from './data-table'
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

function OutputSummary({ details }: { details: Task['resultDetails'] }) {
  const first = details?.[0]
  if (!details || !first) return <span className="admin-cell-secondary">暂无可交付图片</span>

  const describe = (item: NonNullable<Task['resultDetails']>[number]) =>
    `${item.width} × ${item.height} px${item.elapsedMs === null ? '' : ` · ${(item.elapsedMs / 1000).toFixed(1)} 秒`}`

  if (details.length === 1) {
    return <span className="admin-cell-secondary">实际 {describe(first)}</span>
  }

  return (
    <details className="admin-cell-disclosure admin-cell-secondary">
      <summary>
        实际 {details.length} 张 · {first.width} × {first.height} px
      </summary>
      <ol className="admin-cell-output-list">
        {details.map((item, index) => (
          <li key={index}>{describe(item)}</li>
        ))}
      </ol>
    </details>
  )
}

export function AdminTaskTable({
  tasks,
  loading = false,
  sorting,
  onSortingChange,
  ...tableProps
}: { tasks: Task[]; loading?: boolean } & AdminSortProps & AdminTableToolbarProps) {
  const columns: AdminColumn<Task>[] = [
    {
      id: 'createdAt',
      header: '时间 / 任务',
      size: 166,
      pin: 'left',
      sortable: true,
      cell: (task) => (
        <div className="admin-cell-stack">
          <span>{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
          <div className="admin-cell-secondary">
            <AdminCellText value={task.id} previewLimit={12} />
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: '状态',
      size: 114,
      sortable: true,
      cell: (task) => (
        <div className="admin-cell-stack">
          <AdminStatusBadge tone={statusTones[task.status] ?? 'neutral'}>
            {statusLabels[task.status] ?? task.status}
          </AdminStatusBadge>
          {task.errorMessage && (
            <div className="admin-cell-secondary admin-task-compact-error">
              <AdminCellText value={task.errorMessage} previewLimit={20} />
            </div>
          )}
          {!task.settled && <span className="admin-cell-secondary">等待结算</span>}
        </div>
      ),
    },
    {
      id: 'message',
      header: '失败原因 / 说明',
      size: 224,
      cell: (task) => <AdminCellText value={task.errorMessage || '—'} />,
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
      id: 'output',
      header: '请求档位 / 实际输出',
      size: 250,
      cell: (task) => (
        <div className="admin-cell-stack">
          <span>
            请求 {task.aspectRatio || '未知'} / {task.resolution || '未知'}
          </span>
          <OutputSummary details={task.resultDetails} />
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
  ]
  return (
    <AdminDataTable
      {...tableProps}
      title="生成任务列表"
      hideTitle
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
