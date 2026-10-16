'use client'

import { formatCredits } from '@/lib/credits'
import type { AIEndpoint } from '@/lib/ai-settings'
import type { AdminModel as Model } from '@/lib/admin'
import { AdminDataTable, type AdminColumn, type AdminSortProps } from './data-table'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { AdminStatusBadge } from './status-badge'
export function AdminModelList({
  models,
  endpoints,
  unit,
  onEdit,
  loading = false,
  sorting,
  onSortingChange,
}: {
  models: Model[]
  endpoints: AIEndpoint[]
  unit: string
  onEdit: (model: Model) => void
  loading?: boolean
} & AdminSortProps) {
  const columns: AdminColumn<Model>[] = [
    {
      id: 'name',
      header: '模型名称',
      size: 240,
      pin: 'left',
      sortable: true,
      cell: (model) => (
        <div className="admin-cell-heading">
          <strong>{model.name}</strong>
          {model.isDefault && <span className="ops-badge">默认</span>}
        </div>
      ),
    },
    {
      id: 'endpoint',
      header: '服务通道',
      size: 200,
      cell: (model) => endpoints.find((item) => item.id === model.endpointId)?.name ?? '通道已删除',
    },
    {
      id: 'priceMinor',
      header: `单价 / 张（${unit}）`,
      size: 170,
      align: 'right',
      sortable: true,
      cell: (model) => <span className="admin-cell-number">{formatCredits(model.priceMinor)}</span>,
    },
    {
      id: 'enabled',
      header: '状态',
      size: 115,
      sortable: true,
      cell: (model) => (
        <AdminStatusBadge tone={model.enabled ? 'success' : 'danger'}>
          {model.enabled ? '已上架' : '未上架'}
        </AdminStatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      size: 100,
      pin: 'right',
      cell: (model) => (
        <button className="settings-command" disabled={loading} onClick={() => onEdit(model)}>
          <Pencil size={14} />
          编辑
        </button>
      ),
    },
  ]
  return (
    <>
      {!endpoints.length && (
        <p className="ops-empty">
          请先<Link href="/admin/settings">添加生图服务通道</Link>，再发布前台模型。
        </p>
      )}
      <AdminDataTable
        title="模型列表"
        columns={columns}
        data={models}
        getRowId={(model) => model.id}
        loading={loading}
        sorting={sorting}
        onSortingChange={onSortingChange}
        emptyDescription="添加生图服务后，创建模型并设置积分单价。"
      />
    </>
  )
}
