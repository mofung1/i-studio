'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { platformOptions } from './shared'

interface ProductPlatformSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function ProductPlatformSelector({ value, onChange }: ProductPlatformSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="目标平台">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {platformOptions.map(([id, label]) => (
          <SelectItem key={id} value={id}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
