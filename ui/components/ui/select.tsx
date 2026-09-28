'use client'

import {
  Select as AppicaSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectProps as AppicaSelectProps,
} from '@appica/ui-react/select'
import { Children, isValidElement, type ReactNode } from 'react'

interface SelectProps extends Omit<AppicaSelectProps, 'value' | 'defaultValue' | 'onValueChange' | 'itemToStringLabel'> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

function textFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!isValidElement<{ children?: ReactNode }>(node)) return ''
  return Children.toArray(node.props.children).map(textFromNode).join('')
}

function collectLabels(node: ReactNode, labels = new Map<string, string>()) {
  Children.forEach(node, (child) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode }>(child)) return
    if (child.type === SelectItem && child.props.value != null) {
      labels.set(String(child.props.value), textFromNode(child.props.children))
    }
    if (child.props.children) collectLabels(child.props.children, labels)
  })
  return labels
}

function Select({ onValueChange, children, ...props }: SelectProps) {
  const labels = collectLabels(children)
  return (
    <AppicaSelect
      {...props}
      itemToStringLabel={(value) => labels.get(String(value)) ?? String(value)}
      onValueChange={onValueChange ? (value) => onValueChange(String(value)) : undefined}
    >
      {children}
    </AppicaSelect>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
