'use client'

import type { AdminMember } from '@/lib/admin'
import { formatCredits } from '@/lib/credits'
import { AdminDataTable, type AdminColumn, type AdminSortProps } from './data-table'
import { AdminStatusBadge } from './status-badge'

export function AdminUserTable({
  members,
  unit,
  loading,
  busy,
  onAdjust,
  onToggle,
  sorting,
  onSortingChange,
}: {
  members: AdminMember[]
  unit: string
  loading: boolean
  busy: boolean
  onAdjust: (member: AdminMember) => void
  onToggle: (member: AdminMember) => void
} & AdminSortProps) {
  const columns: AdminColumn<AdminMember>[] = [
    {
      id: 'username',
      header: '账号',
      size: 200,
      pin: 'left',
      sortable: true,
      cell: (member) => <strong>{member.username}</strong>,
    },
    { id: 'role', header: '角色', size: 90, cell: () => '用户' },
    {
      id: 'available',
      header: `可用余额（${unit}）`,
      size: 180,
      align: 'right',
      sortable: true,
      cell: (member) => (
        <span className="admin-cell-number">{formatCredits(member.available)}</span>
      ),
    },
    {
      id: 'held',
      header: '预留余额',
      size: 130,
      align: 'right',
      sortable: true,
      cell: (member) => <span className="admin-cell-number">{formatCredits(member.held)}</span>,
    },
    {
      id: 'status',
      header: '状态',
      size: 110,
      sortable: true,
      cell: (member) => (
        <AdminStatusBadge tone={member.status === 'active' ? 'success' : 'danger'}>
          {member.status === 'active' ? '已启用' : '已停用'}
        </AdminStatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      size: 220,
      pin: 'right',
      cell: (member) => (
        <div className="ops-row-actions">
          <button
            className="settings-command"
            disabled={loading || busy}
            onClick={() => onAdjust(member)}
          >
            调整余额
          </button>
          <button
            className="settings-command admin-action"
            data-tone={member.status === 'active' ? 'danger' : 'success'}
            disabled={loading || busy}
            onClick={() => onToggle(member)}
          >
            {member.status === 'active' ? '停用' : '启用'}
          </button>
        </div>
      ),
    },
  ]
  return (
    <AdminDataTable
      title="用户列表"
      columns={columns}
      data={members}
      getRowId={(member) => member.id}
      loading={loading}
      sorting={sorting}
      onSortingChange={onSortingChange}
      emptyDescription="没有符合搜索条件的用户，试试其他用户名。"
    />
  )
}
