'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SelectedImageThumbnailProps {
  file: File
  label: string
  onRemove: () => void
}

export function SelectedImageThumbnail({ file, label, onRemove }: SelectedImageThumbnailProps) {
  const [preview, setPreview] = useState('')
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
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
      <div className="uploaded-thumb">
        {preview && <button className="thumb-preview" type="button" aria-label={`放大查看${label}`} title="放大查看" onClick={() => setExpanded(true)}><img src={preview} alt={`${label}：${file.name}`} /></button>}
        <span>{label}</span>
        <button className="thumb-remove" type="button" aria-label={`删除${label}`} title="删除图片" onClick={onRemove}><X size={13} /></button>
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
