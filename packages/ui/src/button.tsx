import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from './lib/utils.js'

const buttonVariants = cva(
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/30 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-neutral-950 text-white hover:bg-black',
        secondary: 'border border-neutral-200 bg-white text-neutral-950 hover:bg-neutral-50',
        ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950',
      },
      size: {
        default: 'h-10 px-4',
        small: 'h-9 px-3 text-xs',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ asChild = false, className, size, variant, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'

  return <Component className={cn(buttonVariants({ className, size, variant }))} {...props} />
}

