import type { ComponentProps } from 'react'
import { cn } from './ui/lib/utils'

/** Shared ordering: secondary actions first, the primary action last. */
export function DialogActions({
  className,
  sticky = false,
  ...props
}: ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-dialog-actions=""
      className={cn('dialog-actions', sticky && 'dialog-actions-sticky', className)}
      {...props}
    />
  )
}
