'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './lib/utils'

const button = cva('btn', {
  variants: {
    variant: {
      gradient: 'btn-grad',
      white: 'btn-white',
      soft: 'btn-soft',
      ghost: 'btn-ghost',
    },
    size: {
      sm: 'btn-sm',
      default: '',
      lg: 'btn-lg',
      icon: 'btn-ico',
    },
    block: { true: 'btn-block', false: '' },
  },
  defaultVariants: { variant: 'gradient', size: 'default', block: false },
})

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'>,
    VariantProps<typeof button> {
  asChild?: boolean
  loading?: boolean
  children?: ReactNode
}

export function Button({
  asChild = false,
  className,
  variant,
  size,
  block,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(button({ variant, size, block }), className)

  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    )
  }

  return (
    <button className={classes} disabled={loading || disabled} {...props}>
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
