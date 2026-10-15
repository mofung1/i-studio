'use client'

import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import type { AdminMember as Member } from '@/lib/admin'
export function AdminBalanceEditor({
  adjusting,
  amount,
  note,
  unit,
  busy,
  onAmountChange,
  onNoteChange,
  onClose,
  onSubmit,
}: {
  adjusting: Member
  amount: string
  note: string
  unit: string
  busy: boolean
  onAmountChange: (value: string) => void
  onNoteChange: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <section className="ops-card ops-editor" aria-label="调整用户余额">
      <div className="ops-card-heading">
        <h2>调整 {adjusting.username} 的余额</h2>
        <button
          className="settings-icon"
          disabled={busy}
          aria-label="关闭余额调整"
          onClick={() => onClose()}
        >
          <X size={18} />
        </button>
      </div>
      <form onSubmit={(event) => void onSubmit(event)}>
        <div className="ops-form-grid">
          <label className="settings-field">
            <span>调整数量（{unit}）</span>
            <input
              autoFocus
              required
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="100 或 -20"
            />
            <small>正数增加，负数扣减，不影响生成中预留</small>
          </label>
          <label className="settings-field">
            <span>调整原因</span>
            <input
              required
              maxLength={200}
              value={note}
              disabled={busy}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
        </div>
        <div className="settings-form-actions">
          <button
            type="button"
            className="settings-command"
            disabled={busy}
            onClick={() => onClose()}
          >
            取消
          </button>
          <button className="settings-primary" disabled={busy}>
            确认调整
          </button>
        </div>
      </form>
    </section>
  )
}
