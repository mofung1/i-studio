'use client'

import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface InfoDialogProps {
  title: string
  /** 一行补充说明（任务名 / 时间等） */
  subtitle?: string
  onClose: () => void
  children?: ReactNode
}

/** 只读信息弹窗：样式与确认弹窗一致，底部只有一个「知道了」。 */
export function InfoDialog({ title, subtitle, onClose, children }: InfoDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title" ref={dialogRef}>
        <header className="confirm-dialog-head">
          <h2 id="info-dialog-title">{title}</h2>
          <button type="button" aria-label="关闭" title="关闭" onClick={onClose}><X size={17} /></button>
        </header>
        {subtitle && <p className="confirm-dialog-note">{subtitle}</p>}
        {children}
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-primary" autoFocus onClick={onClose}>知道了</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
