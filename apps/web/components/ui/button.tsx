import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-hover',
        secondary: 'border border-border bg-surface text-foreground hover:bg-surface-subtle',
        ghost: 'bg-transparent text-muted hover:bg-surface-subtle hover:text-foreground',
      },
      size: {
        // 对齐 DESIGN-SYSTEM §5：默认 36px，核心生成 42px，图标 32px
        default: 'h-9 px-4 text-sm',
        large: 'h-[42px] px-5 text-sm',
        small: 'h-9 px-3 text-xs',
        icon: 'size-8 p-0',
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
  loading?: boolean
  children?: ReactNode
}

export function Button({ asChild = false, className, size, variant, loading, disabled, children, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'

  // asChild 模式下 Slot 只接受单一子元素，loading 图标无法额外插入，此时忽略 loading
  const content = loading && !asChild ? (
    <>
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      {children}
    </>
  ) : children

  return (
    <Component
      className={cn(buttonVariants({ className, size, variant }))}
      disabled={loading || disabled}
      {...props}
    >
      {content}
    </Component>
  )
}

