'use client'

import type { AdminAudit as Audit } from '@/lib/admin'
import { AdminTable as Table } from './table'

export function AdminAuditTable({ audit }: { audit: Audit[] }) {
  return (
    <section className="ops-card">
      <Table headings={['时间', '操作人', '操作', '对象', '内容']} empty={!audit.length}>
        {audit.map((item) => (
          <tr key={item.id}>
            <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
            <td>{item.actor}</td>
            <td>{item.action}</td>
            <td>{item.targetId.slice(0, 16) || '—'}</td>
            <td className="ops-message-cell">{item.detail}</td>
          </tr>
        ))}
      </Table>
    </section>
  )
}
