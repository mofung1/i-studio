'use client'

import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from './use-dialog-focus'
import { useOverlayContainer } from './overlay-root'

interface ConfirmDialogProps {
  title: string
  /** 说明这次操作会做什么 */
  description: string
  /** 需要重点提醒的后果，例如「删除后不可恢复」 */
  detail?: string
  confirmLabel: string
  busy?: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}

/** 通用二次确认弹窗：删除这类不可恢复的操作统一走它，样式与重新生成弹窗保持一致。 */
export function ConfirmDialog({
  title,
  description,
  detail,
  confirmLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const overlayContainer = useOverlayContainer()
  const container = overlayContainer ?? document.body

  useDialogFocus(
    dialogRef,
    () => {
      if (!busy) onCancel()
    },
    '.confirm-dialog-cancel',
    container,
  )

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="confirm-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" aria-label="关闭" title="关闭" disabled={busy} onClick={onCancel}>
            <X size={17} />
          </button>
        </header>
        <p className="confirm-dialog-note">{description}</p>
        {error && (
          <p className="form-notice error" role="alert">
            {error}
          </p>
        )}
        {detail && (
          <p className="confirm-dialog-warning">
            <AlertTriangle size={13} aria-hidden="true" />
            {detail}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="confirm-dialog-primary is-danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    container,
  )
}
