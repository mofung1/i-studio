'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { containImage } from '@/lib/image-fit'

/** The frame follows the actual image area after controls, thumbnails and composer reflow. */
export function ImageViewport({
  aspectRatio,
  loading = false,
  children,
}: {
  aspectRatio: number
  loading?: boolean
  children: ReactNode
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setBounds((previous) =>
        Math.abs(previous.width - width) < 0.1 && Math.abs(previous.height - height) < 0.1
          ? previous
          : { width, height },
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const className = loading ? 'result-hero-skeleton' : 'result-hero'
  const size = containImage(bounds.width, bounds.height, aspectRatio)
  return (
    <div
      ref={viewportRef}
      className="result-image-viewport"
      style={{ '--image-aspect-ratio': String(aspectRatio) } as CSSProperties}
    >
      <div
        className={className}
        style={size.width && size.height ? size : { width: '100%', height: '100%' }}
      >
        {children}
      </div>
    </div>
  )
}
