'use client'

import { useRef, useState, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function ArtworkGallery({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  function update() {
    const element = track.current!
    setEdge({
      start: element.scrollLeft <= 2,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    })
  }
  function move(event: MouseEvent<HTMLButtonElement>, direction: number) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.75,
      behavior: reduced || event.detail === 0 ? 'auto' : 'smooth',
    })
  }
  return (
    <div className="artwork-gallery">
      <div
        className="artwork-gallery-track"
        ref={track}
        onScroll={update}
        tabIndex={0}
        role="region"
        aria-label="横向作品画廊，可滑动或使用方向键浏览"
      >
        {children}
      </div>
      <div className="artwork-gallery-controls">
        <div>
          <button
            type="button"
            aria-label="向前浏览作品"
            disabled={edge.start}
            onClick={(event) => move(event, -1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="向后浏览作品"
            disabled={edge.end}
            onClick={(event) => move(event, 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
