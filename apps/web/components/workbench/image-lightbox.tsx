'use client'

import { Check, ChevronLeft, ChevronRight, Crop, Download, Loader2, Maximize, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useProtectedImageUrl } from '@/components/authenticated-image'

interface ImageLightboxProps {
  path: string
  alt: string
  /** 下载与裁剪产物使用的文件名前缀 */
  filename: string
  /** 同一次生成有多张时，可在查看器内左右切换 */
  hasPrev?: boolean
  hasNext?: boolean
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
}

type CropBox = { x: number; y: number; w: number; h: number }
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_CROP = 0.05
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6]
const cropPresets: ReadonlyArray<{ label: string; ratio: number | null }> = [
  { label: '自由', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * 结果图查看器：查看态支持放大 / 缩小 / 拖动平移；裁剪态支持框选后导出到本地。
 * 裁剪完全在浏览器内完成，不写回服务端，也不产生新的生成费用。
 */
export function ImageLightbox({ path, alt, filename, hasPrev, hasNext, onPrev, onNext, onClose }: ImageLightboxProps) {
  const { source, state, retry } = useProtectedImageUrl(path)
  const [mode, setMode] = useState<'view' | 'crop'>('view')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, w: 1, h: 1 })
  const [aspect, setAspect] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // 图片在舞台里的实际显示矩形，裁剪框按像素对齐到这张图上
  const [imageRect, setImageRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; box: CropBox } | null>(null)
  const panRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  const resetView = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const measureImage = useCallback(() => {
    const stage = stageRef.current
    const image = imageRef.current
    if (!stage || !image) return
    const stageRect = stage.getBoundingClientRect()
    const imageBox = image.getBoundingClientRect()
    setImageRect({
      left: imageBox.left - stageRect.left,
      top: imageBox.top - stageRect.top,
      width: imageBox.width,
      height: imageBox.height,
    })
  }, [])

  const exitCrop = useCallback(() => {
    setMode('view')
    setCrop({ x: 0, y: 0, w: 1, h: 1 })
    setAspect(null)
    setStatus('')
    resetView()
  }, [resetView])

  // Esc 关闭灯箱；裁剪态第一次按 Esc 先退出裁剪
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mode === 'crop') exitCrop()
        else onClose()
        return
      }
      if (mode !== 'view') return
      if (event.key === 'ArrowLeft' && hasPrev) onPrev?.()
      if (event.key === 'ArrowRight' && hasNext) onNext?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [exitCrop, hasNext, hasPrev, mode, onClose, onNext, onPrev])

  // 窗口尺寸变化时重新测量，保证裁剪框始终贴合图片
  useEffect(() => {
    if (mode !== 'crop') return
    measureImage()
    const observer = new ResizeObserver(() => measureImage())
    if (stageRef.current) observer.observe(stageRef.current)
    window.addEventListener('resize', measureImage)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureImage)
    }
  }, [measureImage, mode, source])

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.findIndex((value) => value >= current - 0.001)
      const safeIndex = index === -1 ? ZOOM_STEPS.length - 1 : index
      const next = ZOOM_STEPS[clamp(safeIndex + direction, 0, ZOOM_STEPS.length - 1)] ?? 1
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'view' || zoom <= 1) return
    panRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
  }

  function startCropDrag(dragMode: DragMode, event: React.PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { mode: dragMode, startX: event.clientX, startY: event.clientY, box: crop }
  }

  // 拖动 / 平移统一挂在 window 上，指针移出容器也不会中断
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const image = imageRef.current
      const pan = panRef.current
      if (pan && image) {
        setOffset({ x: pan.offsetX + (event.clientX - pan.x), y: pan.offsetY + (event.clientY - pan.y) })
        return
      }
      const drag = dragRef.current
      if (!drag || !image) return
      const rect = image.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dx = (event.clientX - drag.startX) / rect.width
      const dy = (event.clientY - drag.startY) / rect.height
      const box = drag.box

      if (drag.mode === 'move') {
        setCrop({ ...box, x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) })
        return
      }

      const right = box.x + box.w
      const bottom = box.y + box.h
      const next: CropBox = { ...box }
      if (drag.mode === 'nw' || drag.mode === 'sw') {
        const left = clamp(box.x + dx, 0, right - MIN_CROP)
        next.x = left
        next.w = right - left
      } else {
        next.w = clamp(box.w + dx, MIN_CROP, 1 - box.x)
      }
      if (drag.mode === 'nw' || drag.mode === 'ne') {
        const top = clamp(box.y + dy, 0, bottom - MIN_CROP)
        next.y = top
        next.h = bottom - top
      } else {
        next.h = clamp(box.h + dy, MIN_CROP, 1 - box.y)
      }
      setCrop(next)
    }

    const onUp = () => {
      dragRef.current = null
      panRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  /** 按目标比例取最大居中裁剪框；自由模式还原为整图 */
  function applyPreset(ratio: number | null) {
    setAspect(ratio)
    if (ratio === null) {
      setCrop({ x: 0, y: 0, w: 1, h: 1 })
      return
    }
    const image = imageRef.current
    const imageRatio = image && image.naturalWidth && image.naturalHeight
      ? image.naturalWidth / image.naturalHeight
      : 1
    let width = 1
    let height = 1
    if (imageRatio > ratio) width = ratio / imageRatio
    else height = imageRatio / ratio
    setCrop({ x: (1 - width) / 2, y: (1 - height) / 2, w: width, h: height })
  }

  async function cropAndDownload() {
    const image = imageRef.current
    if (!image || state !== 'loaded') return
    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    if (!naturalWidth || !naturalHeight) return
    setIsSaving(true)
    setStatus('')
    try {
      const sourceX = Math.round(crop.x * naturalWidth)
      const sourceY = Math.round(crop.y * naturalHeight)
      const width = Math.max(1, Math.round(crop.w * naturalWidth))
      const height = Math.max(1, Math.round(crop.h * naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器不支持裁剪')
      context.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('裁剪失败，请重试')
      saveBlob(blob, `${filename}-crop-${width}x${height}.png`)
      setStatus(`已裁剪 ${width}×${height} 并下载到本地`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '裁剪失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className="image-lightbox"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="lightbox-panel" role="dialog" aria-modal="true" aria-label={`${alt}查看器`}>
        <header className="lightbox-bar">
          <span className="lightbox-title">{alt}</span>
          <div className="lightbox-tools">
            {mode === 'view' ? (
              <>
                {onPrev && (
                  <button type="button" aria-label="上一张" title="上一张（←）" disabled={!hasPrev} onClick={onPrev}><ChevronLeft size={16} /></button>
                )}
                {onNext && (
                  <button type="button" aria-label="下一张" title="下一张（→）" disabled={!hasNext} onClick={onNext}><ChevronRight size={16} /></button>
                )}
                <button type="button" aria-label="缩小" title="缩小" disabled={zoom <= 1} onClick={() => stepZoom(-1)}><ZoomOut size={16} /></button>
                <span className="lightbox-zoom">{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="放大" title="放大" disabled={zoom >= 6} onClick={() => stepZoom(1)}><ZoomIn size={16} /></button>
                <button type="button" aria-label="适应窗口" title="适应窗口" onClick={resetView}><Maximize size={16} /></button>
                <button
                  type="button"
                  className="lightbox-primary"
                  aria-label="裁剪"
                  title="裁剪后下载到本地"
                  onClick={() => {
                    setMode('crop')
                    setCrop({ x: 0, y: 0, w: 1, h: 1 })
                    setAspect(null)
                    resetView()
                    window.requestAnimationFrame(measureImage)
                  }}
                >
                  <Crop size={16} />裁剪
                </button>
              </>
            ) : (
              <>
                {cropPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={aspect === preset.ratio ? 'is-active' : ''}
                    aria-pressed={aspect === preset.ratio}
                    onClick={() => applyPreset(preset.ratio)}
                  >
                    {preset.label}
                  </button>
                ))}
                <button type="button" className="lightbox-primary" aria-label="裁剪并下载" disabled={isSaving} onClick={() => void cropAndDownload()}>
                  {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}裁剪并下载
                </button>
                <button type="button" aria-label="退出裁剪" title="退出裁剪" onClick={exitCrop}><RotateCcw size={16} /></button>
              </>
            )}
            <button type="button" aria-label="关闭" title="关闭" onClick={onClose}><X size={18} /></button>
          </div>
        </header>

        <div
          className={`lightbox-stage ${mode === 'crop' ? 'is-cropping' : ''}`}
          ref={stageRef}
          onPointerDown={startPan}
          onWheel={(event) => {
            if (mode !== 'view') return
            event.preventDefault()
            stepZoom(event.deltaY < 0 ? 1 : -1)
          }}
          onDoubleClick={() => { if (mode === 'view') zoom > 1 ? resetView() : setZoom(2) }}
        >
          {state === 'failed' && (
            <div className="lightbox-fallback">
              <span>图片加载失败</span>
              <button type="button" onClick={retry}>重新加载</button>
            </div>
          )}
          {state !== 'failed' && !source && (
            <div className="lightbox-fallback"><Loader2 size={18} className="animate-spin" /><span>图片加载中…</span></div>
          )}
          {source && state !== 'failed' && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                className="lightbox-image"
                src={source}
                alt={alt}
                draggable={false}
                style={mode === 'view' ? { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` } : undefined}
                onLoad={() => window.requestAnimationFrame(measureImage)}
              />
              {mode === 'crop' && imageRect && (
                <div
                  className="crop-box"
                  role="presentation"
                  style={{
                    left: imageRect.left + crop.x * imageRect.width,
                    top: imageRect.top + crop.y * imageRect.height,
                    width: crop.w * imageRect.width,
                    height: crop.h * imageRect.height,
                  }}
                  onPointerDown={(event) => startCropDrag('move', event)}
                >
                  <span className="crop-grid" aria-hidden="true" />
                  {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                    <span
                      key={corner}
                      aria-hidden="true"
                      className={`crop-handle crop-handle-${corner}`}
                      onPointerDown={(event) => startCropDrag(corner, event)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="lightbox-foot">
          {status
            ? <span className="lightbox-status"><Check size={13} aria-hidden="true" />{status}</span>
            : (
              <span className="lightbox-status is-muted">
                {mode === 'crop'
                  ? '拖动框选裁剪区域，选好比例后点「裁剪并下载」；裁剪结果只保存在本地。'
                  : '滚轮或双击缩放，放大后可拖动平移。'}
              </span>
            )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
