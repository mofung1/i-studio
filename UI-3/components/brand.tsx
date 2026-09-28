import Link from 'next/link'

import { cn } from '@/components/ui'

/** 黑方块 + 光圈：黑白主题里，标记本身不需要颜色。 */
export function BrandMark({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <span className={cn('brand-mark', small && 'is-sm', className)} aria-hidden="true">
      <span className="brand-aperture" />
    </span>
  )
}

export function Brand({ withText = true }: { withText?: boolean }) {
  return (
    <Link href="/" aria-label="iStudio 生成工作台" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandMark />
      {withText && (
        <span>
          <strong className="brand-word">iStudio</strong>
          <span className="brand-sub">AI 商品视觉工作台</span>
        </span>
      )}
    </Link>
  )
}
