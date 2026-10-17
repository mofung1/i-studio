'use client'

import { ChevronDown, ChevronUp, History } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { AuthenticatedImage } from '@/components/authenticated-image'
import type { InlineGenerationTask } from './use-generation-task'

interface GenerationFilmstripProps {
  items: InlineGenerationTask[]
  activeIndex: number
  activeImageIndex: number
  onSelect: (resultIndex: number, imageIndex: number) => void
  onViewAll?: () => void
}

/** One compact row of results, grouped by generation rather than repeated cards. */
export function GenerationFilmstrip({
  items,
  activeIndex,
  activeImageIndex,
  onSelect,
  onViewAll,
}: GenerationFilmstripProps) {
  const [collapsed, setCollapsed] = useState(true)
  const listId = useId()
  const listRef = useRef<HTMLOListElement>(null)
  const versions = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.resultImages?.length)
    .reverse()
  const total = versions.reduce((sum, { item }) => sum + (item.resultImages?.length ?? 0), 0)
  useEffect(() => {
    if (collapsed) return
    const list = listRef.current
    const selected = list?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!list || !selected) return
    const bounds = list.getBoundingClientRect()
    const target = selected.getBoundingClientRect()
    if (target.left < bounds.left) list.scrollLeft -= bounds.left - target.left + 8
    else if (target.right > bounds.right) list.scrollLeft += target.right - bounds.right + 8
  }, [activeIndex, activeImageIndex, collapsed, items.length])
  if (!versions.length) return null
  return (
    <section className="generation-filmstrip" aria-label="最近生成" data-collapsed={collapsed}>
      <header className="filmstrip-head">
        <button
          type="button"
          className="filmstrip-toggle"
          aria-label={collapsed ? '展开最近生成' : '收起最近生成'}
          aria-expanded={!collapsed}
          aria-controls={listId}
          title={`${versions.length} 次生成，共 ${total} 张图片`}
          onClick={() => setCollapsed(!collapsed)}
        >
          <History size={14} aria-hidden="true" />
          <span>最近生成</span>
          <small>
            {versions.length} 次 · {total} 张
          </small>
          {collapsed ? (
            <ChevronUp size={13} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} aria-hidden="true" />
          )}
        </button>
        {onViewAll && (
          <button className="filmstrip-view-all" type="button" onClick={onViewAll}>
            全部记录
          </button>
        )}
      </header>
      <ol ref={listRef} id={listId} className="filmstrip-list" hidden={collapsed}>
        {versions.map(({ item, index }, order) => (
          <li key={item.id} className="filmstrip-version">
            <span className="filmstrip-version-label">
              {order === 0 ? '最新' : `第 ${index + 1} 次`}
              <small>{item.resultImages!.length} 张</small>
            </span>
            <div
              className="filmstrip-images"
              role="group"
              aria-label={`第 ${index + 1} 次生成的图片`}
            >
              {item.resultImages!.map((path, imageIndex) => (
                <button
                  key={`${path}:${imageIndex}`}
                  type="button"
                  className="filmstrip-thumb"
                  aria-label={`查看第 ${index + 1} 个版本的第 ${imageIndex + 1} 张`}
                  aria-pressed={index === activeIndex && imageIndex === activeImageIndex}
                  onClick={() => onSelect(index, imageIndex)}
                >
                  <AuthenticatedImage
                    path={path}
                    alt={`第 ${index + 1} 次生成，第 ${imageIndex + 1} 张`}
                  />
                  <span className="filmstrip-image-index">{imageIndex + 1}</span>
                  {item.status !== 'succeeded' && (
                    <span className="filmstrip-partial" title="部分完成" aria-label="部分完成" />
                  )}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
