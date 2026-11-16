'use client'

import { X } from 'lucide-react'
import { type ReactNode, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from './use-dialog-focus'
import { useOverlayContainer } from './overlay-root'
import { DialogActions } from './dialog-actions'

interface InfoDialogProps {
  title: string
  /** 一行补充说明（任务名 / 时间等） */
  subtitle?: string
  onClose: () => void
  children?: ReactNode
  hideActions?: boolean
  portalContainer?: HTMLElement | null
  footer?: ReactNode
  scrollBody?: boolean
}

/** 只读信息弹窗：样式与确认弹窗一致，底部只有一个「知道了」。 */
export function InfoDialog({
  title,
  subtitle,
  onClose,
  children,
  hideActions = false,
  portalContainer,
  footer,
  scrollBody = false,
}: InfoDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const overlayContainer = useOverlayContainer()
  const container = portalContainer ?? overlayContainer ?? document.body
  const fixedBody = scrollBody || (!hideActions && !!children)

  useDialogFocus(dialogRef, onClose, 'button', container)

  return createPortal(
    <div
      className="dialog-backdrop info-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onDrop={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
        event.stopPropagation()
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        className={`confirm-dialog${fixedBody ? ' info-dialog-with-footer' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="confirm-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" aria-label="关闭" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        {subtitle && <p className="confirm-dialog-note">{subtitle}</p>}
        {fixedBody && !scrollBody ? <div className="dialog-scroll-body">{children}</div> : children}
        {footer}
        {!hideActions && (
          <DialogActions className="confirm-dialog-actions">
            <button type="button" className="confirm-dialog-primary" onClick={onClose}>
              知道了
            </button>
          </DialogActions>
        )}
      </div>
    </div>,
    container,
  )
}
