'use client'

import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { InfoDialog } from './info-dialog'

export function LibrarySelect({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; disabled?: boolean
}) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(([id, title]) => <SelectItem value={id} key={id}>{title}</SelectItem>)}</SelectContent>
  </Select>
}
export function LibraryDialog({ title, children, onClose, portalContainer }: { title: string; children: ReactNode; onClose: () => void; portalContainer?: HTMLElement | null }) {
  return <InfoDialog title={title} onClose={onClose} hideActions portalContainer={portalContainer}><div className="library-dialog-body">{children}</div></InfoDialog>
}
