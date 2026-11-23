'use client'
import { useRef, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'

/** Admin editors share focus trapping, Escape handling and theme-scoped portals. */
export function AdminEditorDialog({
  title,
  subtitle,
  children,
  onClose,
  hideActions = false,
  portalContainer,
  footer,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  onClose: () => void
  hideActions?: boolean
  portalContainer?: HTMLElement | null
  footer?: ReactNode
}) {
  const returnFocus = useRef<HTMLElement | null>(null)
  const fixedBody = !!footer || !hideActions
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={`admin-editor-dialog${fixedBody ? ' admin-editor-with-footer' : ''}`}
        portalContainer={portalContainer}
        {...(!subtitle && { 'aria-describedby': undefined })}
        onOpenAutoFocus={() => {
          const current = document.activeElement
          returnFocus.current = current instanceof HTMLElement ? current : null
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocus.current?.isConnected) return
          event.preventDefault()
          returnFocus.current.focus({ preventScroll: true })
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        {fixedBody ? <div className="dialog-scroll-body">{children}</div> : children}
        {footer}
        {!hideActions && (
          <DialogFooter>
            <Button onClick={onClose}>知道了</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
