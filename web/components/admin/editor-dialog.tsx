'use client'
import type { ReactNode } from 'react'
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
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle ?? '修改后保存，配置将立即生效。'}</DialogDescription>
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
