'use client'

import { Button as AppicaButton, type ButtonProps as AppicaButtonProps } from '@appica/ui-react/button'
import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './lib/utils'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  asChild?: boolean
  loading?: boolean
  children?: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'soft' | 'light' | 'primary-outline' | 'ghost' | 'destructive'
  size?: 'default' | 'large' | 'small' | 'icon'
}

const sizeMap: Record<NonNullable<ButtonProps['size']>, AppicaButtonProps['size']> = {
  default: 'md',
  large: 'lg',
  small: 'sm',
  icon: 'icon-md',
}

export function Button({ asChild = false, className, size = 'default', variant = 'primary', loading, disabled, children, ...props }: ButtonProps) {
  const content = loading && !asChild ? (
    <><Loader2 size={16} className="animate-spin" aria-hidden="true" />{children}</>
  ) : children

  if (asChild) {
    return <Slot className={cn('appica-link-button', className)} {...props}>{children}</Slot>
  }

  return (
    <AppicaButton
      className={className}
      size={sizeMap[size]}
      variant={variant}
      disabled={loading || disabled}
      {...props}
    >
      {content}
    </AppicaButton>
  )
}
