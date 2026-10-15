'use client'

import type { AdminAudit as Audit } from '@/lib/admin'
import { AdminTable as Table } from './table'

const actionLabels: Record<string, string> = {
  'admin.login': '登录后台',
  'admin.credentials': '设置后台账号',
  'admin.environment.create': '初始化后台账号',
  'admin.environment.update': '更新后台账号',
  'admin.environment.release': '解除环境管理员绑定',
  'settings.update': '更新运营设置',
  'user.update': '更新用户状态',
  'credit.adjust': '调整用户余额',
  'model.save': '保存模型与定价',
  'storage.update': '更新图片存储',
  'POST ai-endpoints': '添加 AI 服务',
  'PUT ai-endpoints': '修改 AI 服务',
  'DELETE ai-endpoints': '删除 AI 服务',
  'PUT prompt-templates': '保存系统提示词',
  'PUT prompt-reverse-settings': '保存图片反推配置',
  'PUT site-settings': '更新网站品牌',
  'POST inspiration/prompts': '新增灵感提示词',
  'PUT inspiration/prompts': '编辑灵感提示词',
  'DELETE inspiration/prompts': '删除灵感提示词',
  'POST inspiration/categories': '新增灵感分类',
  'PUT inspiration/categories': '修改灵感分类',
  'DELETE inspiration/categories': '删除灵感分类',
}

export function AdminAuditTable({ audit, loading = false }: { audit: Audit[]; loading?: boolean }) {
  return (
    <section className="ops-card">
      <Table
        headings={['时间', '操作人', '操作', '对象', '内容']}
        empty={!audit.length}
        loading={loading}
      >
        {audit.map((item) => (
          <tr key={item.id}>
            <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
            <td>{item.actor}</td>
            <td title={item.action}>
              {item.action === 'POST ai-endpoints' && item.targetId.endsWith('/test')
                ? '测试 AI 服务'
                : item.action === 'POST ai-endpoints' && item.targetId.endsWith('/default')
                  ? '切换默认 AI 服务'
                  : (actionLabels[item.action] ?? item.action)}
            </td>
            <td className="ops-message-cell">{item.targetId || '—'}</td>
            <td className="ops-message-cell">{item.detail}</td>
          </tr>
        ))}
      </Table>
    </section>
  )
}
