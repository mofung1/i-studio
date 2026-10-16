'use client'

import { Download, History, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { AuthenticatedImage } from '@/components/authenticated-image'

import type { InlineGenerationTask } from './use-generation-task'
import { GenerationFilmstrip } from './generation-filmstrip'

interface GenerationHistoryProps {
  placement?: 'bottom' | 'sidebar' | 'filmstrip'
  onViewAll?: () => void
  items: InlineGenerationTask[]
  activeIndex: number
  /** 当前选中的版本里正在查看第几张 */
  activeImageIndex: number
  onSelect: (resultIndex: number, imageIndex: number) => void
  onDownload: (path: string, filename: string) => void
  onUseAsReference: (path: string) => void
}

const MAX_THUMBS = 4

/** 最近生成：让「一次生成」变成可以来回对比、继续迭代的版本列表。 */
export function GenerationHistory({
  items,
  activeIndex,
  activeImageIndex,
  onSelect,
  onDownload,
  onUseAsReference,
  placement = 'bottom',
  onViewAll,
}: GenerationHistoryProps) {
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const list = listRef.current
    const selected = list?.querySelector<HTMLElement>('.history-item.active')
    if (!list || !selected) return
    const listBounds = list.getBoundingClientRect()
    const selectedBounds = selected.getBoundingClientRect()
    if (placement === 'sidebar' && window.matchMedia('(min-width: 781px)').matches) {
      if (selectedBounds.top < listBounds.top) list.scrollTop -= listBounds.top - selectedBounds.top
      else if (selectedBounds.bottom > listBounds.bottom)
        list.scrollTop += selectedBounds.bottom - listBounds.bottom
    } else {
      if (selectedBounds.left < listBounds.left)
        list.scrollLeft -= listBounds.left - selectedBounds.left
      else if (selectedBounds.right > listBounds.right)
        list.scrollLeft += selectedBounds.right - listBounds.right
    }
  }, [activeIndex, activeImageIndex, items.length, placement])
  const versions = items.filter((item) => item.resultImages?.length)
  const displayedVersions = placement === 'sidebar' ? [...versions].reverse() : versions
  if (versions.length === 0) return null
  if (placement === 'filmstrip')
    return (
      <GenerationFilmstrip
        items={items}
        activeIndex={activeIndex}
        activeImageIndex={activeImageIndex}
        onSelect={onSelect}
        onViewAll={onViewAll}
      />
    )

  return (
    <section
      className={`history-section${placement === 'sidebar' ? ' history-sidebar' : ''}`}
      data-version-count={versions.length}
      aria-label="最近生成"
    >
      <header className="history-head">
        <h2>
          <History size={15} aria-hidden="true" />
          最近生成
        </h2>
        <span>
          {versions.length} 个版本 · 共{' '}
          {versions.reduce((total, item) => total + (item.resultImages?.length ?? 0), 0)} 张
        </span>
      </header>
      <ol ref={listRef} className="history-list">
        {displayedVersions.map((item) => {
          const images = item.resultImages ?? []
          const cover = images[0]
          if (!cover) return null
          const versionIndex = items.indexOf(item)
          const versionNumber = versionIndex + 1
          const isActiveVersion = versionIndex === activeIndex
          if (placement === 'sidebar')
            return images.map((path, imageIndex) => {
              const selected = isActiveVersion && imageIndex === activeImageIndex
              return (
                <li
                  key={`${item.id}-${imageIndex}`}
                  className={selected ? 'history-item active' : 'history-item'}
                >
                  <div className="history-open">
                    <button
                      type="button"
                      className={selected ? 'history-thumb selected' : 'history-thumb'}
                      aria-pressed={selected}
                      aria-label={`查看第 ${versionNumber} 个版本的第 ${imageIndex + 1} 张`}
                      onClick={() => onSelect(versionIndex, imageIndex)}
                    >
                      <AuthenticatedImage
                        path={path}
                        alt={`第 ${versionNumber} 个版本第 ${imageIndex + 1} 张`}
                      />
                    </button>
                    <button
                      type="button"
                      className="history-meta"
                      aria-label={`查看第 ${versionNumber} 个版本的第 ${imageIndex + 1} 张详情`}
                      onClick={() => onSelect(versionIndex, imageIndex)}
                    >
                      <strong>
                        第 {versionNumber} 次 · 第 {imageIndex + 1} 张
                      </strong>
                      <small>{item.status === 'succeeded' ? '已完成' : '部分完成'}</small>
                    </button>
                  </div>
                  <div className="history-tools">
                    <button
                      type="button"
                      title="下载这张图片"
                      aria-label={`下载第 ${versionNumber} 个版本的第 ${imageIndex + 1} 张图片`}
                      onClick={() =>
                        onDownload(path, `istudio-${item.id.slice(0, 8)}-${imageIndex + 1}.png`)
                      }
                    >
                      <Download size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="用作参考图继续创作"
                      aria-label={`把第 ${versionNumber} 个版本的第 ${imageIndex + 1} 张图片用作参考图`}
                      onClick={() => onUseAsReference(path)}
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })
          return (
            <li key={item.id} className={isActiveVersion ? 'history-item active' : 'history-item'}>
              <div className="history-open">
                <span className={`history-thumbs count-${Math.min(images.length, MAX_THUMBS)}`}>
                  {images.slice(0, MAX_THUMBS).map((path, imageIndex) => (
                    <button
                      key={path}
                      type="button"
                      className={
                        isActiveVersion && imageIndex === activeImageIndex
                          ? 'history-thumb selected'
                          : 'history-thumb'
                      }
                      aria-pressed={isActiveVersion && imageIndex === activeImageIndex}
                      aria-label={`查看第 ${versionNumber} 个版本的第 ${imageIndex + 1} 张`}
                      onClick={() => onSelect(versionIndex, imageIndex)}
                    >
                      <AuthenticatedImage
                        path={path}
                        alt={`第 ${versionNumber} 个版本第 ${imageIndex + 1} 张`}
                      />
                    </button>
                  ))}
                  {images.length > MAX_THUMBS && (
                    <button
                      type="button"
                      className="history-more"
                      aria-label={`查看第 ${versionNumber} 个版本的其余 ${images.length - MAX_THUMBS} 张`}
                      onClick={() => onSelect(versionIndex, MAX_THUMBS)}
                    >
                      +{images.length - MAX_THUMBS}
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  className="history-meta"
                  aria-label={`查看第 ${versionNumber} 个版本的生成结果`}
                  onClick={() => onSelect(versionIndex, 0)}
                >
                  <strong>第 {versionNumber} 次</strong>
                  <small>
                    {images.length} 张 · {item.status === 'succeeded' ? '已完成' : '部分完成'}
                  </small>
                </button>
              </div>
              <div className="history-tools">
                <button
                  type="button"
                  title="下载该版本第一张"
                  aria-label={`下载第 ${versionNumber} 个版本的第一张图片`}
                  onClick={() => onDownload(cover, `istudio-${item.id.slice(0, 8)}-1.png`)}
                >
                  <Download size={13} />
                </button>
                <button
                  type="button"
                  title="用作参考图继续迭代"
                  aria-label={`把第 ${versionNumber} 个版本的第一张图片用作参考图`}
                  onClick={() => onUseAsReference(cover)}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
