'use client'

import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  title: string
  /** 说明这次操作会做什么 */
  description: string
  /** 需要重点提醒的后果，例如「删除后不可恢复」 */
  detail?: string
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** 通用二次确认弹窗：删除这类不可恢复的操作统一走它，样式与重新生成弹窗保持一致。 */
export function ConfirmDialog({
  title, description, detail, confirmLabel, busy = false, onCancel, onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll('button')
      if (!focusables?.length) return
      const first = focusables[0] as HTMLElement
      const last = focusables[focusables.length - 1] as HTMLElement
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" ref={dialogRef}>
        <header className="confirm-dialog-head">
          <h2 id="confirm-dialog-title">{title}</h2>
          <button type="button" aria-label="关闭" title="关闭" onClick={onCancel}><X size={17} /></button>
        </header>
        <p className="confirm-dialog-note">{description}</p>
        {detail && (
          <p className="confirm-dialog-warning">
            <AlertTriangle size={13} aria-hidden="true" />
            {detail}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="confirm-dialog-primary is-danger" autoFocus disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
