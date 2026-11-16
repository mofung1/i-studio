'use client'
import { Button } from '@/components/admin/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import { Ban, CircleCheck, Ellipsis } from 'lucide-react'
import { useRef } from 'react'

import type { AdminMember } from '@/lib/admin'
import { formatCredits } from '@/lib/credits'
import { AdminDataTable, type AdminColumn, type AdminSortProps } from './data-table'
import { AdminStatusBadge } from './status-badge'

function MemberStatusMenu({
  member,
  disabled,
  onToggle,
}: {
  member: AdminMember
  disabled: boolean
  onToggle: (member: AdminMember) => void
}) {
  const selected = useRef(false)
  const active = member.status === 'active'
  const StatusIcon = active ? Ban : CircleCheck

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${member.username}的更多操作`}
          disabled={disabled}
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={() => {
          if (!selected.current) return
          selected.current = false
          // Let Radix restore the trigger so the confirmation dialog can return focus to it.
          queueMicrotask(() => onToggle(member))
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant={active ? 'destructive' : 'default'}
            onSelect={() => {
              selected.current = true
            }}
          >
            <StatusIcon aria-hidden="true" />
            {active ? '停用' : '启用'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
      size: 180,
      pin: 'left',
      sortable: true,
      cell: (member) => <strong>{member.username}</strong>,
    },
    { id: 'role', header: '角色', size: 80, cell: () => '用户' },
    {
      id: 'available',
      header: `可用余额（${unit}）`,
      size: 160,
      align: 'right',
      sortable: true,
      cell: (member) => (
        <span className="admin-cell-number">{formatCredits(member.available)}</span>
      ),
    },
    {
      id: 'held',
      header: '预留余额',
      size: 120,
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
      size: 154,
      pin: 'right',
      cell: (member) => (
        <div className="ops-row-actions">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || busy}
            onClick={() => onAdjust(member)}
          >
            调整余额
          </Button>
          <MemberStatusMenu member={member} disabled={loading || busy} onToggle={onToggle} />
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
