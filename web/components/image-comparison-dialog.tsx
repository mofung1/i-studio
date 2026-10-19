'use client'

import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Columns2,
  GripVertical,
  Images,
  Maximize,
  RefreshCw,
  SplitSquareHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useProtectedImageUrl } from './authenticated-image'
import { LibrarySelect } from './library-controls'
import { ComparisonAssetBrowser } from './assets/comparison-asset-browser'
import { useDialogFocus } from './use-dialog-focus'
import {
  clampComparisonPan,
  clampComparisonZoom,
  comparisonCandidates,
  comparisonDivider,
  comparisonZoomSteps,
  type ComparisonImage,
  type ComparisonPan,
} from '@/lib/image-comparison'

export function ImageComparisonDialog({
  candidates,
  initialLeft,
  initialRight,
  browseLibrary,
  onClose,
}: {
  candidates: ComparisonImage[]
  initialLeft?: string
  initialRight?: string
  browseLibrary?: { projectId?: string }
  onClose: () => void
}) {
  const [pickedImages, setPickedImages] = useState<ComparisonImage[]>([])
  const images = comparisonCandidates([...candidates, ...pickedImages])
  const [leftPath, setLeftPath] = useState(initialLeft ?? images[0]?.path ?? '')
  const [rightPath, setRightPath] = useState(
    initialRight ??
      (browseLibrary ? '' : (images.find((item) => item.path !== leftPath)?.path ?? '')),
  )
  const [choosing, setChoosing] = useState<'a' | 'b' | null>(
    browseLibrary && !initialRight ? 'b' : null,
  )
  const [mode, setMode] = useState<'side' | 'slider'>(() =>
    !browseLibrary && typeof window !== 'undefined' && window.innerWidth < 700 ? 'slider' : 'side',
  )
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<ComparisonPan>({ x: 0, y: 0 })
  const [divider, setDivider] = useState(50)
  const panel = useRef<HTMLDivElement>(null)
  const libraryEnabled = !!browseLibrary
  useEffect(() => {
    if (libraryEnabled && !choosing)
      panel.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="更换图片 B"]')
        ?.focus({ preventScroll: true })
  }, [choosing, libraryEnabled])
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    width: number
    height: number
    pan: ComparisonPan
  } | null>(null)
  useDialogFocus(
    panel,
    () => {
      if (choosing && left && right) setChoosing(null)
      else onClose()
    },
    'button[aria-label="关闭图片对比"]',
  )
  const left = images.find((item) => item.path === leftPath) ?? images[0]
  const right = rightPath
    ? (images.find((item) => item.path === rightPath && item.path !== left?.path) ??
      images.find((item) => item.path !== left?.path))
    : undefined
  function reset() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    drag.current = null
  }
  function changeZoom(direction: -1 | 1) {
    const next =
      direction === 1
        ? (comparisonZoomSteps.find((value) => value > zoom + 0.01) ?? 8)
        : ([...comparisonZoomSteps].reverse().find((value) => value < zoom - 0.01) ?? 1)
    setZoom(next)
    setPan((previous) => clampComparisonPan(previous, next))
  }
  function nudge(x: number, y: number) {
    setPan((previous) => clampComparisonPan({ x: previous.x + x, y: previous.y + y }, zoom))
  }
  function keyPan(event: KeyboardEvent<HTMLDivElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-0.05, 0],
      ArrowRight: [0.05, 0],
      ArrowUp: [0, -0.05],
      ArrowDown: [0, 0.05],
    }
    if (event.key === '0') {
      event.preventDefault()
      reset()
    }
    const direction = directions[event.key]
    if (direction && zoom > 1) {
      event.preventDefault()
      nudge(...direction)
    }
  }
  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (
      zoom <= 1 ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest('button,input,select')
    )
      return
    const box = event.currentTarget.getBoundingClientRect()
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
      pan,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function movePan(event: PointerEvent<HTMLDivElement>) {
    const value = drag.current
    if (!value || event.pointerId !== value.pointerId) return
    setPan(
      clampComparisonPan(
        {
          x: value.pan.x + (event.clientX - value.x) / Math.max(1, value.width),
          y: value.pan.y + (event.clientY - value.y) / Math.max(1, value.height),
        },
        zoom,
      ),
    )
  }
  const handlers = {
    onPointerDown: startPan,
    onPointerMove: movePan,
    onPointerUp: () => {
      drag.current = null
    },
    onPointerCancel: () => {
      drag.current = null
    },
    onLostPointerCapture: () => {
      drag.current = null
    },
    onKeyDown: keyPan,
  }
  return createPortal(
    <div
      className="dialog-backdrop comparison-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="comparison-dialog"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-title"
      >
        <header className="comparison-header">
          <div>
            <h2 id="comparison-title">图片对比</h2>
            <p>{choosing ? '固定当前图片，再选择另一张进行比较' : '挑选细节，比较不同版本'}</p>
          </div>
          {!choosing && (
            <div className="comparison-mode" role="group" aria-label="对比模式">
              <button
                type="button"
                aria-label="并排对比"
                aria-pressed={mode === 'side'}
                onClick={() => {
                  setMode('side')
                  reset()
                }}
              >
                <Columns2 size={16} />
                <span className="comparison-desktop-label">并排</span>
                <span className="comparison-mobile-label">上下</span>
              </button>
              <button
                type="button"
                aria-label="滑杆对比"
                aria-pressed={mode === 'slider'}
                onClick={() => {
                  setMode('slider')
                  reset()
                }}
              >
                <SplitSquareHorizontal size={16} />
                滑杆
              </button>
            </div>
          )}
          <button className="comparison-close" aria-label="关闭图片对比" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {choosing && browseLibrary ? (
          <ComparisonAssetBrowser
            key={choosing}
            side={choosing}
            anchor={choosing === 'a' ? right : left}
            projectId={browseLibrary.projectId}
            suggestions={images}
            onBack={left && right ? () => setChoosing(null) : undefined}
            onSelect={(image) => {
              if (!comparisonCandidates([image]).length) return
              setPickedImages((current) => comparisonCandidates([...current, image]))
              if (choosing === 'a') setLeftPath(image.path)
              else setRightPath(image.path)
              reset()
              setDivider(50)
              setChoosing(null)
            }}
          />
        ) : left && right ? (
          <>
            <div className="comparison-pickers">
              <label>
                <span>图片 A</span>
                {browseLibrary ? (
                  <ComparisonChoice
                    image={left}
                    label="更换图片 A"
                    onClick={() => setChoosing('a')}
                  />
                ) : (
                  <LibrarySelect
                    label="对比图片 A"
                    value={left.path}
                    title={left.label}
                    onChange={(value) => {
                      reset()
                      setDivider(50)
                      setLeftPath(value)
                    }}
                    options={images
                      .filter((item) => item.path !== right.path)
                      .map((item) => [item.path, item.label])}
                  />
                )}
              </label>
              <button
                className="library-command"
                aria-label="交换两张图片"
                title="交换 A / B"
                onClick={() => {
                  setLeftPath(right.path)
                  setRightPath(left.path)
                  setDivider(50)
                  reset()
                }}
              >
                <ArrowLeftRight size={17} />
              </button>
              <label>
                <span>图片 B</span>
                {browseLibrary ? (
                  <ComparisonChoice
                    image={right}
                    label="更换图片 B"
                    onClick={() => setChoosing('b')}
                  />
                ) : (
                  <LibrarySelect
                    label="对比图片 B"
                    value={right.path}
                    title={right.label}
                    onChange={(value) => {
                      reset()
                      setDivider(50)
                      setRightPath(value)
                    }}
                    options={images
                      .filter((item) => item.path !== left.path)
                      .map((item) => [item.path, item.label])}
                  />
                )}
              </label>
            </div>
            <div className="comparison-toolbar" role="toolbar" aria-label="同步查看控制">
              <span className="comparison-sync">同步缩放与平移</span>
              <button
                className="library-command"
                aria-label="缩小对比图片"
                disabled={zoom <= 1}
                onClick={() => changeZoom(-1)}
              >
                <ZoomOut size={16} />
              </button>
              <output aria-label="对比缩放倍率">× {zoom.toFixed(2)}</output>
              <button
                className="library-command"
                aria-label="放大对比图片"
                disabled={zoom >= 8}
                onClick={() => changeZoom(1)}
              >
                <ZoomIn size={16} />
              </button>
              <button className="library-command" aria-label="适应对比视图" onClick={reset}>
                <Maximize size={16} />
                适应
              </button>
              <div className="comparison-pan-buttons" role="group" aria-label="平移对比图片">
                <button aria-label="向左平移" disabled={zoom <= 1} onClick={() => nudge(-0.1, 0)}>
                  <ArrowLeft size={14} />
                </button>
                <button aria-label="向上平移" disabled={zoom <= 1} onClick={() => nudge(0, -0.1)}>
                  <ArrowUp size={14} />
                </button>
                <button aria-label="向下平移" disabled={zoom <= 1} onClick={() => nudge(0, 0.1)}>
                  <ArrowDown size={14} />
                </button>
                <button aria-label="向右平移" disabled={zoom <= 1} onClick={() => nudge(0.1, 0)}>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
            <ComparisonImages
              key={`${left.path}:${right.path}`}
              left={left}
              right={right}
              mode={mode}
              zoom={zoom}
              pan={pan}
              divider={divider}
              onDivider={setDivider}
              handlers={handlers}
            />
            {mode === 'slider' && (
              <label className="comparison-range">
                <span>分割位置</span>
                <input
                  type="range"
                  aria-label="对比分割位置"
                  min={0}
                  max={100}
                  step={1}
                  value={divider}
                  onChange={(event) => setDivider(Number(event.target.value))}
                />
                <output>{Math.round(divider)}%</output>
              </label>
            )}
            <footer className="comparison-footer">
              <span>原图等比显示 · 放大后拖动或用方向键移动 · 0 恢复适应</span>
              <span>仅对比查看，图片保持原样</span>
            </footer>
          </>
        ) : (
          <div className="library-empty-state">
            <Columns2 size={32} />
            <strong>需要两张不同的图片</strong>
            <p>从资产中选择两张，或在生成结果中加入参考原图。</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function ComparisonChoice({
  image,
  label,
  onClick,
}: {
  image: ComparisonImage
  label: string
  onClick: () => void
}) {
  const { source, state } = useProtectedImageUrl(image.path)
  return (
    <button
      type="button"
      className="comparison-image-choice"
      aria-label={label}
      title={image.label}
      onClick={onClick}
    >
      <span className="comparison-choice-thumb">
        {state === 'loaded' && source && <img src={source} alt="" />}
      </span>
      <strong>{image.label}</strong>
      <Images size={16} aria-hidden="true" />
    </button>
  )
}

function ComparisonImages({
  left,
  right,
  mode,
  zoom,
  pan,
  divider,
  onDivider,
  handlers,
}: {
  left: ComparisonImage
  right: ComparisonImage
  mode: 'side' | 'slider'
  zoom: number
  pan: ComparisonPan
  divider: number
  onDivider: (value: number) => void
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
    onLostPointerCapture: () => void
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  }
}) {
  const a = useProtectedImageUrl(left.path)
  const b = useProtectedImageUrl(right.path)
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>(
    {},
  )
  const dividerDrag = useRef<{ pointerId: number; left: number; width: number } | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const transform: CSSProperties = {
    transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${clampComparisonZoom(zoom)})`,
  }
  const [imageErrors, setImageErrors] = useState({ a: false, b: false })
  const [imageRetry, setImageRetry] = useState({ a: 0, b: 0 })
  function imageLoaded(key: 'a' | 'b', image: HTMLImageElement) {
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setDimensions((previous) => ({ ...previous, [key]: size }))
    setImageErrors((previous) => ({ ...previous, [key]: false }))
  }
  function retryImage(key: 'a' | 'b') {
    setImageErrors((previous) => ({ ...previous, [key]: false }))
    setImageRetry((previous) => ({ ...previous, [key]: previous[key] + 1 }))
    if (key === 'a') a.retry()
    else b.retry()
  }
  const failedA = a.state === 'failed' || imageErrors.a
  const failedB = b.state === 'failed' || imageErrors.b
  const ready =
    a.state === 'loaded' &&
    b.state === 'loaded' &&
    dimensions.a &&
    dimensions.b &&
    !failedA &&
    !failedB
  const imageA = (
    <img
      key={imageRetry.a}
      src={a.source || undefined}
      alt={`图片 A：${left.label}`}
      className="comparison-image"
      draggable={false}
      style={transform}
      onLoad={(event) => imageLoaded('a', event.currentTarget)}
      onError={() => setImageErrors((previous) => ({ ...previous, a: true }))}
    />
  )
  const imageB = (
    <img
      key={imageRetry.b}
      src={b.source || undefined}
      alt={`图片 B：${right.label}`}
      className="comparison-image"
      draggable={false}
      style={transform}
      onLoad={(event) => imageLoaded('b', event.currentTarget)}
      onError={() => setImageErrors((previous) => ({ ...previous, b: true }))}
    />
  )
  const feedback = !ready && (
    <div className="comparison-feedback" role="status">
      {failedA || failedB ? (
        <>
          <span>部分图片无法读取，请重新加载或选择其他图片。</span>
          {failedA && (
            <button className="library-command" onClick={() => retryImage('a')}>
              <RefreshCw size={15} />
              重试图片 A
            </button>
          )}
          {failedB && (
            <button className="library-command" onClick={() => retryImage('b')}>
              <RefreshCw size={15} />
              重试图片 B
            </button>
          )}
        </>
      ) : (
        <span>正在读取原图…</span>
      )}
    </div>
  )
  const sizesDiffer =
    dimensions.a &&
    dimensions.b &&
    (dimensions.a.width !== dimensions.b.width || dimensions.a.height !== dimensions.b.height)
  return (
    <div className="comparison-workspace">
      <div ref={stage} className={`comparison-stages is-${mode}${zoom > 1 ? ' is-zoomed' : ''}`}>
        {mode === 'side' ? (
          <>
            <div className="comparison-stage" tabIndex={0} aria-label="图片 A 视图" {...handlers}>
              {imageA}
              <span className="comparison-image-label">
                A{dimensions.a && ` · ${dimensions.a.width} × ${dimensions.a.height}`}
              </span>
            </div>
            <div className="comparison-stage" tabIndex={0} aria-label="图片 B 视图" {...handlers}>
              {imageB}
              <span className="comparison-image-label">
                B{dimensions.b && ` · ${dimensions.b.width} × ${dimensions.b.height}`}
              </span>
            </div>
          </>
        ) : (
          <div
            className="comparison-stage comparison-overlay"
            tabIndex={0}
            aria-label="滑杆对比画面"
            {...handlers}
          >
            {imageB}
            <div
              className="comparison-overlay-front"
              style={{ clipPath: `inset(0 ${100 - divider}% 0 0)` }}
            >
              {imageA}
            </div>
            <span className="comparison-image-label">A</span>
            <span className="comparison-image-label is-right">B</span>
            <button
              type="button"
              aria-label="拖动对比分割线"
              className="comparison-divider"
              style={{ left: `${divider}%` }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  event.stopPropagation()
                  onDivider(
                    Math.min(100, Math.max(0, divider + (event.key === 'ArrowLeft' ? -1 : 1))),
                  )
                }
              }}
              onPointerDown={(event) => {
                const box = stage.current?.getBoundingClientRect()
                if (!box) return
                event.preventDefault()
                event.stopPropagation()
                dividerDrag.current = {
                  pointerId: event.pointerId,
                  left: box.left,
                  width: box.width,
                }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const drag = dividerDrag.current
                if (drag?.pointerId === event.pointerId)
                  onDivider(comparisonDivider(event.clientX, drag.left, drag.width))
              }}
              onPointerUp={() => {
                dividerDrag.current = null
              }}
              onPointerCancel={() => {
                dividerDrag.current = null
              }}
              onLostPointerCapture={() => {
                dividerDrag.current = null
              }}
            >
              <GripVertical size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        {feedback}
      </div>
      {sizesDiffer && (
        <p className="comparison-size-note">
          两张图片尺寸不同，按各自比例居中显示；滑杆用于视觉比较，不代表像素对齐。
        </p>
      )}
    </div>
  )
}
