'use client'

import { formatCredits } from '@/lib/credits'
import type { AIEndpoint } from '@/lib/ai-settings'
import type { AdminModel as Model } from '@/lib/admin'
import { AdminTable as Table } from './table'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
export function AdminModelList({
  models,
  endpoints,
  unit,
  onEdit,
}: {
  models: Model[]
  endpoints: AIEndpoint[]
  unit: string
  onEdit: (model: Model) => void
}) {
  return (
    <>
      {!endpoints.length && (
        <p className="ops-empty">
          请先<Link href="/admin/settings">添加生图服务通道</Link>，再发布前台模型。
        </p>
      )}
      <section className="ops-card">
        <Table
          headings={['模型名称', '服务通道', `单价 / 张（${unit}）`, '状态', '操作']}
          empty={!models.length}
        >
          {models.map((model) => (
            <tr key={model.id}>
              <td>
                <strong>{model.name}</strong>
                {model.isDefault && <span className="ops-badge">默认</span>}
              </td>
              <td>
                {endpoints.find((item) => item.id === model.endpointId)?.name ?? '通道已删除'}
              </td>
              <td>{formatCredits(model.priceMinor)}</td>
              <td>
                <span className="ops-badge">{model.enabled ? '已上架' : '未上架'}</span>
              </td>
              <td>
                <button className="settings-command" onClick={() => onEdit(model)}>
                  <Pencil size={14} />
                  编辑
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  )
}
