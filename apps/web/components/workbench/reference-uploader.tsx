'use client'

import { ImagePlus, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { SelectedImageThumbnail } from './selected-image-thumbnail'

interface ReferenceUploaderProps {
  files: File[]
  onChange: (files: File[]) => void
  max: number
  /** 每个缩略图下方的主标签 */
  labelFor: (index: number) => string
  emptyTitle: string
  emptyHint: string
  acceptedHint: string
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 参考图 / 商品素材上传：空态是整块拖拽区，有图后是缩略图列表。 */
export function ReferenceUploader({
  files,
  onChange,
  max,
  labelFor,
  emptyTitle,
  emptyHint,
  acceptedHint,
}: ReferenceUploaderProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const sortRef = useRef<{ index: number; startX: number; startY: number; active: boolean } | null>(null)

  const full = files.length >= max

  function accept(selected: File[]) {
    if (selected.length === 0) return
    const images = selected.filter((file) => ACCEPTED_TYPES.includes(file.type))
    const rejected = selected.length - images.length
    const room = max - files.length
    const next = [...files, ...images].slice(0, max)
    onChange(next)

    if (rejected > 0) setError('仅支持 JPG / PNG / WebP 格式的图片。')
    else if (images.length > room) setError(`最多 ${max} 张，超出的图片已忽略。`)
    else setError('')
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= files.length || from === to) return
    const next = [...files]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    onChange(next)
  }

  /** 缩略图排序：用指针事件实现，比 HTML5 拖放稳定，触控板/鼠标都能用 */
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = sortRef.current
      if (!drag) return
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return
        drag.active = true
        setDraggingIndex(drag.index)
      }
      const items = Array.from(document.querySelectorAll('.uploaded-thumb'))
      const overIndex = items.findIndex((element) => {
        const rect = element.getBoundingClientRect()
        return event.clientX >= rect.left && event.clientX <= rect.right
          && event.clientY >= rect.top && event.clientY <= rect.bottom
      })
      if (overIndex >= 0 && overIndex !== drag.index) {
        move(drag.index, overIndex)
        drag.index = overIndex
        setDraggingIndex(overIndex)
      }
    }

    const onPointerUp = () => {
      const drag = sortRef.current
      sortRef.current = null
      setDraggingIndex(null)
      if (!drag?.active) return
      // 刚刚是排序而不是点击，吞掉这次 click，避免顺手打开预览
      const swallowClick = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        window.removeEventListener('click', swallowClick, true)
      }
      window.addEventListener('click', swallowClick, true)
      window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 0)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [files])

  function startSort(index: number, event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    // 工具按钮（前移 / 替换 / 删除）不触发排序
    if (target.closest('.thumb-tools') || target.closest('.thumb-remove')) return
    sortRef.current = { index, startX: event.clientX, startY: event.clientY, active: false }
  }

  /** 只有从系统拖入文件时才显示整块覆盖层，避免盖住缩略图之间的排序拖放 */
  function isExternalFileDrag(event: React.DragEvent) {
    const types = event.dataTransfer?.types
    return draggingIndex === null && !!types && Array.from(types).includes('Files')
  }

  return (
    <div
      className={`reference-uploader ${isDraggingOver ? 'is-dragging-over' : ''}`}
      onDragOver={(event) => {
        if (!isExternalFileDrag(event)) return
        event.preventDefault()
        if (!full) setIsDraggingOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setIsDraggingOver(false)
      }}
      onDrop={(event) => {
        if (!isExternalFileDrag(event)) return
        event.preventDefault()
        setIsDraggingOver(false)
        if (full) {
          setError(`最多 ${max} 张，请先删掉一张再添加。`)
          return
        }
        accept(Array.from(event.dataTransfer.files ?? []))
      }}
    >
      {files.length === 0 ? (
        <label className="reference-dropzone">
          <span className="reference-dropzone-icon"><ImagePlus size={22} aria-hidden="true" /></span>
          <strong>{emptyTitle}</strong>
          <span>{emptyHint}</span>
          <span className="reference-dropzone-hint">{acceptedHint}</span>
          <input
            ref={inputRef}
            type="file"
            multiple={max > 1}
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              accept(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
        </label>
      ) : (
        <>
          <div className="upload-list">
            {files.map((file, index) => (
              <SelectedImageThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                file={file}
                label={labelFor(index)}
                index={index}
                total={files.length}
                isDragging={draggingIndex === index}
                onPointerDown={(event) => startSort(index, event)}
                onRemove={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                onReplace={(next) => onChange(files.map((current, fileIndex) => (fileIndex === index ? next : current)))}
                onMove={move}
              />
            ))}
            {!full && (
              <label className="add-thumb">
                <span className="add-thumb-icon"><Upload size={16} aria-hidden="true" /></span>
                <span>添加图片</span>
                <input
                  multiple={max > 1}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    accept(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
          <p className="reference-meta">
            <span>{files.length}/{max} 张</span>
            <span>可拖动排序</span>
          </p>
        </>
      )}

      {isDraggingOver && <span className="reference-drop-overlay" aria-hidden="true">松开即可上传</span>}
      {error && <p className="field-helper is-error" role="alert">{error}</p>}
    </div>
  )
}
