'use client'

import dynamic from 'next/dynamic'
import { Columns2 } from 'lucide-react'
import { useState } from 'react'
import { comparisonCandidates, type ComparisonImage } from '@/lib/image-comparison'

export const LazyImageComparison = dynamic(
  () => import('./image-comparison-dialog').then((module) => module.ImageComparisonDialog),
  { ssr: false },
)

interface ComparisonSetup {
  candidates: ComparisonImage[]
  initialLeft?: string
  initialRight?: string
  originalFallbackPaths?: string[]
}

export function ImageComparisonButton({
  candidates,
  initialLeft,
  initialRight,
  originalFallbackPaths,
  disabled = false,
}: ComparisonSetup & { disabled?: boolean }) {
  const [comparison, setComparison] = useState<ComparisonSetup | null>(null)
  const items = comparisonCandidates(candidates)
  return (
    <>
      {items.length >= 2 && (
        <button
          type="button"
          className="studio-secondary result-compare-trigger"
          aria-label="对比生成图片"
          title="对比图片"
          disabled={disabled}
          onClick={() =>
            setComparison({ candidates: items, initialLeft, initialRight, originalFallbackPaths })
          }
        >
          <Columns2 size={15} />
          对比
        </button>
      )}
      {comparison && <LazyImageComparison {...comparison} onClose={() => setComparison(null)} />}
    </>
  )
}
