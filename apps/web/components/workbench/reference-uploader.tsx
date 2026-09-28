'use client'

import { ImagePlus, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { SelectedImageThumbnail } from './selected-image-thumbnail'

interface ReferenceUploaderProps {
  files: File[]
  onChange: (files: File[]) => void
  max: number
  /** 每个缩略图下方的主标签 */
  labelFor: (index: number) => string
  /** 第一张素材的角标文案，例如「主图」 */
  badgeFor?: (index: number) => string | undefined
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
  badgeFor,
  emptyTitle,
  emptyHint,
  acceptedHint,
}: ReferenceUploaderProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div
      className={`reference-uploader ${isDraggingOver ? 'is-dragging-over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!full) setIsDraggingOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setIsDraggingOver(false)
      }}
      onDrop={(event) => {
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
                badge={badgeFor?.(index)}
                index={index}
                total={files.length}
                isDragging={draggingIndex === index}
                onRemove={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                onReplace={(next) => onChange(files.map((current, fileIndex) => (fileIndex === index ? next : current)))}
                onDragStart={() => setDraggingIndex(index)}
                onDragEnd={() => setDraggingIndex(null)}
                onDropOn={() => {
                  if (draggingIndex !== null) move(draggingIndex, index)
                  setDraggingIndex(null)
                }}
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
