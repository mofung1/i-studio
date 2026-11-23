'use client'
import { Button } from '@/components/admin/ui/button'

import { formatCredits } from '@/lib/credits'
import { imageProtocolLabels, type AIEndpoint } from '@/lib/ai-settings'
import type { AdminModel as Model } from '@/lib/admin'
import {
  AdminDataTable,
  type AdminColumn,
  type AdminSortProps,
  type AdminTableToolbarProps,
} from './data-table'
import Link from '@/routing/link'
import { CircleAlert, Pencil } from 'lucide-react'
import { AdminStatusBadge } from './status-badge'
import { Badge } from './ui/badge'
export function AdminModelList({
  models,
  endpoints,
  unit,
  onEdit,
  loading = false,
  sorting,
  onSortingChange,
  ...tableProps
}: {
  models: Model[]
  endpoints: AIEndpoint[]
  unit: string
  onEdit: (model: Model) => void
  loading?: boolean
} & AdminSortProps &
  AdminTableToolbarProps) {
  const columns: AdminColumn<Model>[] = [
    {
      id: 'name',
      header: '模型名称',
      size: 164,
      pin: 'left',
      sortable: true,
      cell: (model) => (
        <div className="admin-cell-stack">
          <strong>{model.name}</strong>
          {model.isDefault && <Badge variant="secondary">默认</Badge>}
        </div>
      ),
    },
    {
      id: 'enabled',
      header: '状态',
      size: 116,
      sortable: true,
      cell: (model) => {
        const primary = model.channels?.find((channel) => channel.isActive)
        const endpoint = endpoints.find((item) => item.id === primary?.endpointId)
        const available = !!primary?.enabled && !!endpoint?.enabled
        return (
          <AdminStatusBadge tone={!model.enabled ? 'neutral' : available ? 'success' : 'warning'}>
            {!model.enabled ? '未上架' : available ? '已上架' : '渠道不可用'}
          </AdminStatusBadge>
        )
      },
    },
    {
      id: 'endpoint',
      header: '当前主渠道',
      size: 250,
      cell: (model) => {
        const endpoint = endpoints.find(
          (item) => item.id === model.channels?.find((channel) => channel.isActive)?.endpointId,
        )
        return (
          <div className="model-channel-table-cell">
            <strong>{endpoint?.name ?? '未配置主渠道'}</strong>
            <span>
              {endpoint ? imageProtocolLabels[endpoint.protocol] : '编辑模型以选择渠道'}
              {model.channels?.length ? ` · 共 ${model.channels.length} 个绑定` : ''}
            </span>
          </div>
        )
      },
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
      id: 'actions',
      header: '操作',
      size: 100,
      pin: 'right',
      cell: (model) => (
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => onEdit(model)}>
          <Pencil data-icon="inline-start" />
          编辑
        </Button>
      ),
    },
  ]
  return (
    <>
      {!loading && !endpoints.length && models.length > 0 && (
        <p className="admin-data-note">
          <CircleAlert size={16} aria-hidden="true" />
          <span>
            请先<Link href="/admin/settings?tab=image">添加生图渠道</Link>，再为模型绑定主渠道。
          </span>
        </p>
      )}
      <AdminDataTable
        {...tableProps}
        title="模型列表"
        hideTitle
        columns={columns}
        data={models}
        getRowId={(model) => model.id}
        loading={loading}
        sorting={sorting}
        onSortingChange={onSortingChange}
        emptyTitle={endpoints.length ? '还没有前台模型' : '先连接一个生图渠道'}
        emptyDescription={
          endpoints.length
            ? '点击“添加模型”，填写显示名称与积分单价，绑定主渠道后上架。'
            : '连接供应商后，再创建用户可选的模型并设置积分单价。'
        }
        emptyAction={
          !endpoints.length ? (
            <Button asChild variant="outline">
              <Link href="/admin/settings?tab=image">配置生图渠道</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  )
}
