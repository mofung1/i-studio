import Link from 'next/link'

import { cn } from '@/components/ui'

/** 渐变圆角方块 + 光圈：成像与生成的双关标记。 */
export function BrandTile({ className, large = false }: { className?: string; large?: boolean }) {
  return (
    <span className={cn('brand-tile', !large && 'is-sm', className)} aria-hidden="true">
      <span className="brand-aperture" />
    </span>
  )
}

export function Brand({ withText = true }: { withText?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="iStudio 生成工作台" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandTile large />
      {withText && (
        <span>
          <strong className="brand-word">iStudio</strong>
          <span className="brand-sub">把商品图做成能卖的样子</span>
        </span>
      )}
    </Link>
  )
}
