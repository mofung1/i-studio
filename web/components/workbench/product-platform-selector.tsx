'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { platformOptions } from './shared'

interface ProductPlatformSelectorProps {
  value: string
  onChange: (value: string) => void
  portalContainer: HTMLElement | null
}

export function ProductPlatformSelector({
  value,
  onChange,
  portalContainer,
}: ProductPlatformSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="目标平台">
        <SelectValue />
      </SelectTrigger>
      <SelectContent portalContainer={portalContainer}>
        {platformOptions.map(([id, label]) => (
          <SelectItem key={id} value={id}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
