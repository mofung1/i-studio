'use client'

import { Download, History, RotateCcw } from 'lucide-react'

import { AuthenticatedImage } from '@/components/authenticated-image'

import type { InlineGenerationTask } from './use-generation-task'

interface GenerationHistoryProps {
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
  items, activeIndex, activeImageIndex, onSelect, onDownload, onUseAsReference,
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
          const isActiveVersion = versionIndex === activeIndex
          return (
            <li key={item.id} className={isActiveVersion ? 'history-item active' : 'history-item'}>
              <div className="history-open">
                <span className="history-thumbs">
                  {images.slice(0, MAX_THUMBS).map((path, imageIndex) => (
                    <button
                      key={path}
                      type="button"
                      className={isActiveVersion && imageIndex === activeImageIndex ? 'history-thumb selected' : 'history-thumb'}
                      aria-pressed={isActiveVersion && imageIndex === activeImageIndex}
                      aria-label={`查看第 ${index + 1} 个版本的第 ${imageIndex + 1} 张`}
                      onClick={() => onSelect(versionIndex, imageIndex)}
                    >
                      <AuthenticatedImage path={path} alt={`第 ${index + 1} 个版本第 ${imageIndex + 1} 张`} />
                    </button>
                  ))}
                  {images.length > MAX_THUMBS && (
                    <button
                      type="button"
                      className="history-more"
                      aria-label={`查看第 ${index + 1} 个版本的其余 ${images.length - MAX_THUMBS} 张`}
                      onClick={() => onSelect(versionIndex, MAX_THUMBS)}
                    >
                      +{images.length - MAX_THUMBS}
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  className="history-meta"
                  aria-label={`查看第 ${index + 1} 个版本的生成结果`}
                  onClick={() => onSelect(versionIndex, 0)}
                >
                  <strong>第 {index + 1} 次</strong>
                  <small>{images.length} 张 · {item.status === 'succeeded' ? '已完成' : '部分完成'}</small>
                </button>
              </div>
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
