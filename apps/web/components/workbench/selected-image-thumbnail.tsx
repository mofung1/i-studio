'use client'

import { ArrowLeft, ArrowRight, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SelectedImageThumbnailProps {
  file: File
  label: string
  /** 角标，例如电商第一张素材的「主图」 */
  badge?: string
  index: number
  total: number
  isDragging: boolean
  onRemove: () => void
  onReplace: (file: File) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
  onMove: (from: number, to: number) => void
}

/** 已上传素材缩略图：查看 / 替换 / 删除 / 拖动排序都在这一处完成。 */
export function SelectedImageThumbnail({
  file, label, badge, index, total, isDragging,
  onRemove, onReplace, onDragStart, onDragEnd, onDropOn, onMove,
}: SelectedImageThumbnailProps) {
  const [preview, setPreview] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setIsLoaded(false)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!expanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false)
        return
      }
      // Tab 键循环聚焦在灯箱内，不跑到背后的页面
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = dialog.querySelectorAll('button')
      if (focusables.length === 0) return
      const first = focusables[0] as HTMLElement
      const last = focusables[focusables.length - 1] as HTMLElement
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  return (
    <>
      <div
        className={`uploaded-thumb ${isDragging ? 'is-dragging' : ''}`}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          onDropOn()
        }}
      >
        {preview ? (
          <button className="thumb-preview" type="button" aria-label={`放大查看${label}`} title="放大查看" onClick={() => setExpanded(true)}>
            {!isLoaded && <span className="thumb-skeleton" aria-hidden="true" />}
            <img src={preview} alt={`${label}：${file.name}`} onLoad={() => setIsLoaded(true)} />
          </button>
        ) : <span className="thumb-skeleton" aria-hidden="true" />}
        <span className="thumb-label">{label}</span>
        {badge && <span className="thumb-badge">{badge}</span>}

        <div className="thumb-tools">
          <button
            type="button"
            aria-label={`将${label}前移`}
            title="前移"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <ArrowLeft size={12} />
          </button>
          <button
            type="button"
            aria-label={`替换${label}`}
            title="替换这张图"
            onClick={() => replaceRef.current?.click()}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            aria-label={`将${label}后移`}
            title="后移"
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowRight size={12} />
          </button>
        </div>

        <button className="thumb-remove" type="button" aria-label={`删除${label}`} title="删除图片" onClick={onRemove}><X size={13} /></button>
        <input
          ref={replaceRef}
          className="thumb-replace-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={`替换${label}`}
          tabIndex={-1}
          onChange={(event) => {
            const next = event.target.files?.[0]
            if (next) onReplace(next)
            event.target.value = ''
          }}
        />
      </div>
      {expanded && preview && createPortal(
        <div className="image-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false) }}>
          <div className="image-lightbox-content" role="dialog" aria-modal="true" aria-label={`${label}图片预览`} ref={dialogRef}>
            <button type="button" aria-label="关闭图片预览" title="关闭" autoFocus onClick={() => setExpanded(false)}><X size={20} /></button>
            <img src={preview} alt={`${label}：${file.name}`} />
            <span>{file.name}</span>
          </div>
        </div>, document.body,
      )}
    </>
  )
}
