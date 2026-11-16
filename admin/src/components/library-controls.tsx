'use client'

import type { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { InfoDialog } from './info-dialog'

export function LibrarySelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = '请选择',
  title,
}: {
  label: string
  value: string
  options: ReadonlyArray<readonly [string, string]>
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  title?: string
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} title={title}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(([id, title]) => (
            <SelectItem value={id} key={id} title={title}>
              {title}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
export function LibraryDialog({
  title,
  children,
  onClose,
  portalContainer,
  footer,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  portalContainer?: HTMLElement | null
  footer?: ReactNode
}) {
  return (
    <InfoDialog
      title={title}
      onClose={onClose}
      hideActions
      portalContainer={portalContainer}
      footer={footer}
      scrollBody={!!footer}
    >
      <div className={`library-dialog-body${footer ? ' dialog-scroll-body' : ''}`}>{children}</div>
    </InfoDialog>
  )
}
