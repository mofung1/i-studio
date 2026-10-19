'use client'

import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function AssetAdvancedFilters({
  showTag,
  tag,
  from,
  to,
  onTag,
  onFrom,
  onTo,
  onReset,
}: {
  showTag: boolean
  tag: string
  from: string
  to: string
  onTag: (value: string) => void
  onFrom: (value: string) => void
  onTo: (value: string) => void
  onReset: () => void
}) {
  const host = useRef<HTMLDetailsElement>(null)
  const count = [showTag ? tag.trim() : '', from, to].filter(Boolean).length
  useEffect(() => {
    function outside(event: PointerEvent) {
      const target = event.target as HTMLElement
      if (
        host.current?.open &&
        !host.current.contains(target) &&
        !target.closest('.select-content')
      )
        host.current?.removeAttribute('open')
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || !host.current?.open) return
      event.preventDefault()
      host.current?.removeAttribute('open')
      host.current?.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return (
    <details className="library-advanced" ref={host}>
      <summary>
        <SlidersHorizontal size={14} aria-hidden="true" />
        更多筛选{count > 0 && <span className="asset-filter-count">{count}</span>}
      </summary>
      <div className="asset-filter-popover" aria-label="更多筛选条件">
        {showTag && (
          <label className="asset-filter-tag">
            标签
            <input
              aria-label="筛选标签"
              placeholder="输入完整标签"
              value={tag}
              onChange={(event) => onTag(event.target.value)}
            />
          </label>
        )}
        <label>
          开始日期
          <input
            type="date"
            aria-label="开始日期"
            value={from}
            max={to || undefined}
            onChange={(event) => onFrom(event.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            aria-label="结束日期"
            value={to}
            min={from || undefined}
            onChange={(event) => onTo(event.target.value)}
          />
        </label>
        <footer className="asset-filter-footer">
          <span>{count ? `已设置 ${count} 项` : '按标签和时间筛选'}</span>
          <button type="button" disabled={!count} onClick={onReset}>
            <RotateCcw size={13} aria-hidden="true" />
            重置
          </button>
        </footer>
      </div>
    </details>
  )
}
