'use client'

import { Download, History, RotateCcw } from 'lucide-react'

import { AuthenticatedImage } from '@/components/authenticated-image'

import type { InlineGenerationTask } from './use-generation-task'

interface GenerationHistoryProps {
  items: InlineGenerationTask[]
  activeIndex: number
  onSelect: (resultIndex: number, imageIndex: number) => void
  onDownload: (path: string, filename: string) => void
  onUseAsReference: (path: string) => void
}

const MAX_THUMBS = 3

/** 最近生成：让「一次生成」变成可以来回对比、继续迭代的版本列表。 */
export function GenerationHistory({
  items, activeIndex, onSelect, onDownload, onUseAsReference,
}: GenerationHistoryProps) {
  const versions = items.filter((item) => item.resultImages?.length)
  if (versions.length === 0) return null

  return (
    <section className="history-section" aria-label="最近生成">
      <header className="history-head">
        <h2><History size={15} aria-hidden="true" />最近生成</h2>
        <span>{versions.length} 个版本 · 共 {versions.reduce((total, item) => total + (item.resultImages?.length ?? 0), 0)} 张</span>
      </header>
      <ol className="history-list">
        {versions.map((item, index) => {
          const images = item.resultImages ?? []
          const cover = images[0]
          if (!cover) return null
          const versionIndex = items.indexOf(item)
          return (
            <li key={item.id} className={versionIndex === activeIndex ? 'history-item active' : 'history-item'}>
              <button
                type="button"
                className="history-open"
                aria-label={`查看第 ${index + 1} 个版本的生成结果`}
                aria-pressed={versionIndex === activeIndex}
                onClick={() => onSelect(versionIndex, 0)}
              >
                <span className="history-thumbs">
                  {images.slice(0, MAX_THUMBS).map((path, imageIndex) => (
                    <span key={path} className="history-thumb">
                      <AuthenticatedImage path={path} alt={`第 ${index + 1} 个版本第 ${imageIndex + 1} 张`} />
                    </span>
                  ))}
                  {images.length > MAX_THUMBS && <span className="history-more">+{images.length - MAX_THUMBS}</span>}
                </span>
                <span className="history-meta">
                  <strong>第 {index + 1} 次</strong>
                  <small>{images.length} 张 · {item.status === 'succeeded' ? '已完成' : '部分完成'}</small>
                </span>
              </button>
              <div className="history-tools">
                <button
                  type="button"
                  title="下载该版本第一张"
                  aria-label={`下载第 ${index + 1} 个版本的第一张图片`}
                  onClick={() => onDownload(cover, `istudio-${item.id.slice(0, 8)}-1.png`)}
                >
                  <Download size={13} />
                </button>
                <button
                  type="button"
                  title="用作参考图继续迭代"
                  aria-label={`把第 ${index + 1} 个版本的第一张图片用作参考图`}
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
