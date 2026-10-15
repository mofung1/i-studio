'use client'

import dynamic from 'next/dynamic'
import { Columns2 } from 'lucide-react'
import { useState } from 'react'
import { comparisonCandidates, type ComparisonImage } from '@/lib/image-comparison'

export const LazyImageComparison = dynamic(
  () => import('./image-comparison-dialog').then((module) => module.ImageComparisonDialog),
  { ssr: false },
)
export function ImageComparisonButton({
  candidates,
  initialLeft,
}: {
  candidates: ComparisonImage[]
  initialLeft?: string
}) {
  const [open, setOpen] = useState(false)
  const items = comparisonCandidates(candidates)
  if (items.length < 2) return null
  return (
    <>
      <button
        type="button"
        className="studio-secondary result-compare-trigger"
        aria-label="对比生成图片"
        title="对比图片"
        onClick={() => setOpen(true)}
      >
        <Columns2 size={15} />
        对比
      </button>
      {open && (
        <LazyImageComparison
          candidates={items}
          initialLeft={initialLeft}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
