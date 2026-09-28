'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SelectedImageThumbnailProps {
  file: File
  label: string
  onRemove: () => void
}

/** 已选素材的小方块：可放大，可撤下。 */
export function SelectedImageThumbnail({ file, label, onRemove }: SelectedImageThumbnailProps) {
  const [preview, setPreview] = useState('')
  const [expanded, setExpanded] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusables = dialog.current?.querySelectorAll('button')
      if (!focusables?.length) return
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
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  return (
    <>
      <div className="shot">
        {preview && (
          <button className="shot-zoom" type="button" aria-label={`放大查看${label}`} title="放大查看" onClick={() => setExpanded(true)}>
            <img src={preview} alt={`${label}：${file.name}`} />
          </button>
        )}
        <span className="shot-tag">{label}</span>
        <button className="shot-x" type="button" aria-label={`撤下${label}`} title="撤下这张素材" onClick={onRemove}>
          <X size={13} />
        </button>
      </div>

      {expanded &&
        preview &&
        createPortal(
          <div
            className="overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setExpanded(false)
            }}
          >
            <div className="overlay-card" role="dialog" aria-modal="true" aria-label={`${label}大图`} ref={dialog}>
              <button className="overlay-x" type="button" aria-label="关闭大图" title="关闭" autoFocus onClick={() => setExpanded(false)}>
                <X size={18} />
              </button>
              <img src={preview} alt={`${label}：${file.name}`} />
              <p>{file.name}</p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
