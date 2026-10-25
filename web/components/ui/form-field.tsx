import type { ComponentProps } from 'react'
import { cn } from './lib/utils'

export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="field-group" className={cn('submission-field-group', className)} {...props} />
  )
}
export function Field({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div role="group" data-slot="field" className={cn('submission-field', className)} {...props} />
  )
}
export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label data-slot="field-label" className={cn('submission-field-label', className)} {...props} />
  )
}
