'use client'

import Image from 'next/image'
import { useId, useState } from 'react'
import type { MarketingAsset } from '@/lib/marketing-assets'

export function ProductComparison({
  before,
  after,
}: {
  before: MarketingAsset
  after: MarketingAsset
}) {
  const [split, setSplit] = useState(50)
  const id = useId()
  return (
    <figure className="visual-comparison">
      <div className="visual-comparison-frame">
        <Image
          src={after.src}
          alt={after.alt}
          fill
          sizes="(max-width: 760px) 100vw, 600px"
          draggable={false}
        />
        <div
          className="visual-comparison-before"
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        >
          <Image
            src={before.src}
            alt={before.alt}
            fill
            sizes="(max-width: 760px) 100vw, 600px"
            draggable={false}
          />
        </div>
        <div className="visual-comparison-labels">
          <span>原图</span>
          <span>场景图</span>
        </div>
        <input
          id={id}
          className="visual-comparison-control"
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
          aria-label="拖动比较同一护肤品的原图和场景图"
          aria-valuetext={`基础图显示 ${split}%`}
        />
        <div className="visual-comparison-divider" style={{ left: `${split}%` }} aria-hidden="true">
          <span>↔</span>
        </div>
      </div>
    </figure>
  )
}
