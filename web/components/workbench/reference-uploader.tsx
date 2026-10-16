'use client'

import { isStoredImage, type CreationImage } from '@/lib/creation-images'

import { ChevronLeft, ImagePlus, Plus, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

import { AssetPicker } from './asset-picker'
import { SelectedImageThumbnail } from './selected-image-thumbnail'

interface ReferenceUploaderProps {
  files: CreationImage[]
  onChange: (files: CreationImage[]) => void
  max: number
  /** 每个缩略图下方的主标签 */
  labelFor: (index: number) => string
  emptyTitle: string
  emptyHint: string
  acceptedHint: string
  /** 从指定张数开始堆叠，悬停、点击或键盘操作展开完整列表。 */
  collapseAt?: number
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const fileKeys = new WeakMap<CreationImage, number>()
let nextFileKey = 0

function fileKeyFor(file: CreationImage) {
  const existing = fileKeys.get(file)
  if (existing !== undefined) return existing
  const key = nextFileKey++
  fileKeys.set(file, key)
  return key
}

/** 参考图 / 商品素材上传：空态是整块拖拽区，有图后是缩略图列表。 */
export function ReferenceUploader({
  files,
  onChange,
  max,
  labelFor,
  emptyTitle,
  emptyHint,
  acceptedHint,
  collapseAt,
}: ReferenceUploaderProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const uploaderRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stackToggleRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const sortRef = useRef<{ index: number; startX: number; startY: number; active: boolean } | null>(
    null,
  )
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)
  const [availableWidth, setAvailableWidth] = useState(0)
  const shouldCollapse = Boolean(collapseAt && files.length >= collapseAt)
  const expanded = !shouldCollapse || hovered || pinned || keyboardFocus || draggingIndex !== null

  useEffect(() => {
    if (shouldCollapse && expanded && listRef.current) listRef.current.scrollLeft = 0
  }, [shouldCollapse, expanded])

  function closeStack() {
    setHovered(false)
    setPinned(false)
    setKeyboardFocus(false)
  }

  const full = files.length >= max

  function accept(selected: CreationImage[]) {
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
      const items = Array.from(
        uploaderRef.current?.querySelectorAll<HTMLElement>('.uploaded-thumb') ?? [],
      )
      const overIndex = items.findIndex((element) => {
        const rect = element.getBoundingClientRect()
        return (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        )
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

  useEffect(() => {
    if (!collapseAt) return
    const container = uploaderRef.current?.closest('.composer-input-grid')
    if (!container) return
    // 展开宽度以整块输入区为边界，避免撑出提示词面板或移动端视口。
    const observer = new ResizeObserver(() => setAvailableWidth(container.clientWidth))
    setAvailableWidth(container.clientWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [collapseAt])

  useEffect(() => {
    if (!shouldCollapse) closeStack()
  }, [shouldCollapse])

  useEffect(() => {
    if (!pinned) return
    const closeOutside = (event: PointerEvent) => {
      if (!uploaderRef.current?.contains(event.target as Node)) closeStack()
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [pinned])

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
      ref={uploaderRef}
      className={`reference-uploader ${collapseAt ? 'is-compact' : ''} ${isDraggingOver ? 'is-dragging-over' : ''} ${shouldCollapse ? 'is-stackable' : ''} ${shouldCollapse && !expanded ? 'is-collapsed' : ''}`}
      style={
        collapseAt
          ? ({
              '--reference-slots': files.length + (full ? 0 : 1),
              '--reference-stack-offset': `${Math.min(Math.max(files.length - 1, 0), 2) * 14}px`,
              '--reference-available-width': availableWidth ? `${availableWidth}px` : '100%',
            } as CSSProperties)
          : undefined
      }
      onPointerEnter={(event) => {
        if (
          shouldCollapse &&
          event.pointerType === 'mouse' &&
          window.matchMedia('(hover: hover)').matches
        )
          setHovered(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setHovered(false)
      }}
      onFocusCapture={(event) => {
        if (
          !event.target.closest('.reference-stack-toggle') &&
          event.target.matches(':focus-visible')
        )
          setKeyboardFocus(true)
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setKeyboardFocus(false)
          setPinned(false)
        }
      }}
      onKeyDown={(event) => {
        if (shouldCollapse && event.key === 'Escape') {
          closeStack()
          requestAnimationFrame(() => stackToggleRef.current?.focus())
        }
      }}
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
        <button
          type="button"
          className="reference-dropzone"
          aria-label={emptyTitle}
          title={acceptedHint}
          onClick={() => setPickerOpen(true)}
        >
          <span className="reference-dropzone-icon">
            <ImagePlus size={22} aria-hidden="true" />
          </span>
          <strong>{emptyTitle}</strong>
          <span>{emptyHint}</span>
          <span className="reference-dropzone-hint">{acceptedHint}</span>
        </button>
      ) : (
        <>
          <div ref={listRef} className="upload-list" id={listId} aria-label="已上传图片">
            {files.map((file, index) => {
              const thumbnail = (
                <SelectedImageThumbnail
                  key={fileKeyFor(file)}
                  file={file}
                  label={labelFor(index)}
                  index={index}
                  total={files.length}
                  isDragging={draggingIndex === index}
                  onPointerDown={(event) => startSort(index, event)}
                  onRemove={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                  onReplace={(next) =>
                    onChange(
                      files.map((current, fileIndex) => (fileIndex === index ? next : current)),
                    )
                  }
                  onMove={move}
                />
              )
              return collapseAt ? (
                <div
                  key={fileKeyFor(file)}
                  className={`reference-thumbnail-slot ${index >= 3 ? 'is-overflow' : ''}`}
                  style={
                    {
                      '--reference-index': index,
                      '--reference-angle': `${index % 2 === 0 ? -4 : 4}deg`,
                    } as CSSProperties
                  }
                  inert={shouldCollapse && !expanded}
                >
                  {thumbnail}
                </div>
              ) : (
                thumbnail
              )
            })}
            {!full && (
              <button
                type="button"
                className="add-thumb"
                aria-label="添加图片"
                title={acceptedHint}
                tabIndex={shouldCollapse && !expanded ? -1 : undefined}
                style={
                  collapseAt ? ({ '--reference-index': files.length } as CSSProperties) : undefined
                }
                onClick={() => setPickerOpen(true)}
              >
                <span className="add-thumb-icon">
                  {collapseAt ? (
                    <Plus size={18} aria-hidden="true" />
                  ) : (
                    <Upload size={16} aria-hidden="true" />
                  )}
                </span>
                <span>添加图片</span>
              </button>
            )}
            {shouldCollapse && expanded && (
              <button
                type="button"
                className="reference-stack-close"
                aria-label="收起参考图片"
                onClick={() => {
                  closeStack()
                  requestAnimationFrame(() => stackToggleRef.current?.focus())
                }}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {shouldCollapse && (
            <button
              ref={stackToggleRef}
              type="button"
              className="reference-stack-toggle"
              hidden={expanded}
              aria-label={`展开 ${files.length} 张参考图片`}
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => {
                setPinned(true)
                requestAnimationFrame(() =>
                  uploaderRef.current
                    ?.querySelector<HTMLElement>('.uploaded-thumb')
                    ?.focus({ preventScroll: true }),
                )
              }}
            >
              <span className="reference-stack-count">{files.length}</span>
              {!full && (
                <span className="reference-stack-plus" aria-hidden="true">
                  <Plus size={14} />
                </span>
              )}
            </button>
          )}
          <p className="reference-meta">
            <span>
              {files.length}/{max} 张
            </span>
            <span>可拖动排序</span>
          </p>
        </>
      )}
      {pickerOpen && (
        <AssetPicker
          limit={Math.max(0, max - files.length)}
          excludedIds={files.filter(isStoredImage).map((image) => image.assetId)}
          onClose={() => setPickerOpen(false)}
          onSelect={(images) => {
            onChange([...files, ...images].slice(0, max))
            setError('')
          }}
        />
      )}

      {isDraggingOver && (
        <span className="reference-drop-overlay" aria-hidden="true">
          松开即可上传
        </span>
      )}
      {error && (
        <p className="field-helper is-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
