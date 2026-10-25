'use client'

import { DialogActions } from '@/components/dialog-actions'
import { AlertTriangle, CircleDollarSign, Loader2, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useId, useRef } from 'react'
import { useDialogFocus } from './use-dialog-focus'
import { useOverlayContainer } from './overlay-root'

export interface ConfirmDialogProps {
  title: string
  /** 说明这次操作会做什么 */
  description: string
  /** 需要重点提醒的后果，例如「删除后不可恢复」 */
  detail?: string
  confirmLabel: string
  intent?: 'danger' | 'warning' | 'neutral'
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
  intent = 'danger',
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef(document.activeElement as HTMLElement | null)
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

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel()
      }}
    >
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="dialog-backdrop">
          <DialogPrimitive.Content
            className="confirm-dialog"
            data-intent={intent}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            ref={dialogRef}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              dialogRef.current?.querySelector<HTMLButtonElement>('.confirm-dialog-cancel')?.focus()
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              // A fast reopen must not let the previous dialog steal its focus.
              if (document.querySelector('.confirm-dialog[data-intent]')) return
              if (returnFocus.current?.isConnected)
                returnFocus.current.focus({ preventScroll: true })
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault()
              if (!busy) onCancel()
            }}
            onInteractOutside={(event) => {
              event.preventDefault()
              if (!busy) onCancel()
            }}
          >
            <header className="confirm-dialog-head">
              <div className="confirmation-title">
                <span className="confirmation-icon" aria-hidden="true">
                  {intent === 'warning' ? (
                    <CircleDollarSign size={20} />
                  ) : (
                    <AlertTriangle size={20} />
                  )}
                </span>
                <DialogPrimitive.Title asChild>
                  <h2 id={titleId}>{title}</h2>
                </DialogPrimitive.Title>
              </div>
              <button
                type="button"
                aria-label="关闭"
                title="关闭"
                disabled={busy}
                onClick={onCancel}
              >
                <X size={17} />
              </button>
            </header>
            <DialogPrimitive.Description asChild>
              <p className="confirm-dialog-note">{description}</p>
            </DialogPrimitive.Description>
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
            <DialogActions className="confirm-dialog-actions">
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
                className={`confirm-dialog-primary${intent === 'danger' ? ' is-danger' : ''}`}
                disabled={busy}
                onClick={onConfirm}
              >
                {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                {confirmLabel}
              </button>
            </DialogActions>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
