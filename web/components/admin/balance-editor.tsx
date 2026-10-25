'use client'
import { DialogActions } from '@/components/dialog-actions'
import { Field, FieldGroup, FieldLabel } from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'

import type { FormEvent } from 'react'
export function AdminBalanceEditor({
  amount,
  note,
  unit,
  busy,
  onAmountChange,
  onNoteChange,
  onClose,
  onSubmit,
}: {
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
      <form onSubmit={(event) => void onSubmit(event)}>
        <FieldGroup className="ops-form-grid">
          <Field>
            <FieldLabel className="settings-field">
              <span>调整数量（{unit}）</span>
              <Input
                autoFocus
                required
                inputMode="decimal"
                value={amount}
                disabled={busy}
                onChange={(event) => onAmountChange(event.target.value)}
                placeholder="100 或 -20"
              />
              <small>正数增加，负数扣减，不影响生成中预留</small>
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel className="settings-field">
              <span>调整原因</span>
              <Input
                required
                maxLength={200}
                value={note}
                disabled={busy}
                onChange={(event) => onNoteChange(event.target.value)}
              />
            </FieldLabel>
          </Field>
        </FieldGroup>
        <DialogActions sticky className="settings-form-actions">
          <Button variant="outline" type="button" disabled={busy} onClick={() => onClose()}>
            取消
          </Button>
          <Button disabled={busy}>确认调整</Button>
        </DialogActions>
      </form>
    </section>
  )
}
