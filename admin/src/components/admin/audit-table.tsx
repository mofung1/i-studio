'use client'

import type { AdminAudit as Audit } from '@/lib/admin'
import { AdminDataTable, type AdminColumn, type AdminSortProps } from './data-table'

const actionLabels: Record<string, string> = {
  'admin.login': '登录后台',
  'admin.credentials': '设置后台账号',
  'admin.environment.create': '初始化后台账号',
  'admin.environment.update': '更新后台账号',
  'admin.environment.release': '解除环境管理员绑定',
  'settings.update': '更新运营设置',
  'measurement.cost.update': '录入供应商费用',
  'user.update': '更新用户状态',
  'credit.adjust': '调整用户余额',
  'model.save': '保存模型与定价',
  'storage.update': '更新图片存储',
  'POST ai-endpoints': '添加 AI 服务',
  'PUT ai-endpoints': '修改 AI 服务',
  'DELETE ai-endpoints': '删除 AI 服务',
  'PUT prompt-templates': '保存系统提示词',
  'PUT prompt-reverse-settings': '保存图片反推配置',
  'PUT site-settings': '更新网站配置',
  'POST inspiration/prompts': '新增灵感提示词',
  'PUT inspiration/prompts': '编辑灵感提示词',
  'DELETE inspiration/prompts': '删除灵感提示词',
  'POST inspiration/categories': '新增灵感分类',
  'PUT inspiration/categories': '修改灵感分类',
  'DELETE inspiration/categories': '删除灵感分类',
}

export function AdminAuditTable({
  audit,
  loading = false,
  sorting,
  onSortingChange,
}: { audit: Audit[]; loading?: boolean } & AdminSortProps) {
  const columns: AdminColumn<Audit>[] = [
    {
      id: 'createdAt',
      header: '时间',
      size: 195,
      pin: 'left',
      sortable: true,
      cell: (item) => new Date(item.createdAt).toLocaleString('zh-CN'),
    },
    {
      id: 'actor',
      header: '操作人',
      size: 150,
      sortable: true,
      cell: (item) => <strong>{item.actor}</strong>,
    },
    {
      id: 'action',
      header: '操作',
      size: 200,
      cell: (item) => (
        <span title={item.action}>
          {item.action === 'POST ai-endpoints' && item.targetId.endsWith('/test')
            ? '测试 AI 服务'
            : item.action === 'POST ai-endpoints' && item.targetId.endsWith('/default')
              ? '切换默认 AI 服务'
              : (actionLabels[item.action] ?? item.action)}
        </span>
      ),
    },
    {
      id: 'target',
      header: '对象',
      size: 230,
      cell: (item) => <span className="admin-cell-message">{item.targetId || '—'}</span>,
    },
    {
      id: 'detail',
      header: '内容',
      size: 300,
      cell: (item) => <span className="admin-cell-message">{item.detail}</span>,
    },
  ]
  return (
    <AdminDataTable
      title="操作日志列表"
      columns={columns}
      data={audit}
      getRowId={(item) => String(item.id)}
      loading={loading}
      sorting={sorting}
      onSortingChange={onSortingChange}
      emptyDescription="管理员的配置、余额和权限变更会记录在这里。"
    />
  )
}
