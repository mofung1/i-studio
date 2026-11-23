'use client'

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Brush, RotateCcw, Undo2, X } from 'lucide-react'
import { useProtectedImageUrl } from '@/components/authenticated-image'
import { useDialogFocus } from '@/components/use-dialog-focus'
import { useGenerationCost } from '@/components/generation-cost'
import { GenerationFooter } from '@/components/generation-footer'
import { exportProductMask, maskPoint, paintMask, type MaskMark } from '@/lib/product-mask'
import type { ProductVersion } from '@/lib/products'
import styles from './products.module.css'

export function ProductMaskEditor({
  version,
  modelId,
  modelName,
  submissionError,
  onSubmit,
  onClose,
}: {
  version: ProductVersion
  modelId: string
  modelName: string
  submissionError?: string
  onSubmit: (mask: File, instructions: string) => Promise<boolean>
  onClose: () => void
}) {
  const [marks, setMarks] = useState<MaskMark[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [brush, setBrush] = useState(5)
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rectangle, setRectangle] = useState({ x: 25, y: 25, width: 50, height: 50 })
  const canvas = useRef<HTMLCanvasElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const drawing = useRef<number | null>(null)
  const { source, state, retry } = useProtectedImageUrl(version.contentPath, version.assetId)
  const cost = useGenerationCost(modelId, 1)
  useDialogFocus(
    panel,
    () => {
      if (!busy) onClose()
    },
    'button[aria-label="关闭局部修改"]',
  )
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (context) paintMask(context, size.width, size.height, marks)
  }, [marks, size])
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || event.button !== 0 || !size.width) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = event.pointerId
    const point = maskPoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      size.width,
      size.height,
    )
    setMarks((current) => [
      ...current,
      { kind: 'brush', width: (Math.max(size.width, size.height) * brush) / 100, points: [point] },
    ])
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (drawing.current !== event.pointerId) return
    const point = maskPoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      size.width,
      size.height,
    )
    setMarks((current) =>
      current.map((mark, index) =>
        index === current.length - 1 && mark.kind === 'brush'
          ? { ...mark, points: [...mark.points, point] }
          : mark,
      ),
    )
  }
  function addRectangle() {
    const x = Math.max(0, Math.min(99, rectangle.x)) / 100
    const y = Math.max(0, Math.min(99, rectangle.y)) / 100
    setMarks((current) => [
      ...current,
      {
        kind: 'rectangle',
        x: x * size.width,
        y: y * size.height,
        width: (Math.max(1, Math.min(100 - x * 100, rectangle.width)) / 100) * size.width,
        height: (Math.max(1, Math.min(100 - y * 100, rectangle.height)) / 100) * size.height,
      },
    ])
  }
  async function submit() {
    if (busy || !marks.length || !instructions.trim() || !cost.quote?.canAfford) return
    setBusy(true)
    setError('')
    try {
      const mask = await exportProductMask(size.width, size.height, marks)
      if (await onSubmit(mask, instructions.trim())) onClose()
      else setError('修改尚未提交成功，选区和说明已保留，请查看提示后重试。')
    } catch (error) {
      setError(error instanceof Error ? error.message : '提交失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return createPortal(
    <div className={styles.backdrop}>
      <div
        className={styles.maskDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-mask-title"
        ref={panel}
        tabIndex={-1}
      >
        <header className={styles.sectionHead}>
          <div>
            <h2 id="product-mask-title">局部修改</h2>
            <p>涂抹需要修改的区域，原版本会保留。</p>
          </div>
          <button
            className={styles.iconButton}
            aria-label="关闭局部修改"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className={styles.maskBody}>
          <div className={styles.maskImageArea}>
            {state === 'failed' ? (
              <div className={styles.empty}>
                <p>图片读取失败</p>
                <button className="studio-secondary" onClick={retry}>
                  重新加载图片
                </button>
              </div>
            ) : !source ? (
              <p role="status">正在读取原图…</p>
            ) : (
              <div className={styles.maskStage}>
                <img
                  src={source}
                  alt="待修改的商品图片"
                  draggable={false}
                  onLoad={(event) =>
                    setSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                />
                <canvas
                  ref={canvas}
                  width={size.width}
                  height={size.height}
                  aria-label="涂抹修改区域；也可使用右侧矩形选区"
                  onPointerDown={start}
                  onPointerMove={move}
                  onPointerUp={() => {
                    drawing.current = null
                  }}
                  onPointerCancel={() => {
                    drawing.current = null
                  }}
                />
              </div>
            )}
          </div>
          <div className={styles.maskControls}>
            <fieldset disabled={busy || !size.width} className={styles.fields}>
              <label>
                <span className={styles.inlineLabel}>
                  <Brush size={15} />
                  画笔大小
                </span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={brush}
                  onChange={(event) => setBrush(Number(event.target.value))}
                />
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={!marks.length}
                  onClick={() => setMarks((current) => current.slice(0, -1))}
                >
                  <Undo2 size={15} />
                  撤销一笔
                </button>
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={!marks.length}
                  onClick={() => setMarks([])}
                >
                  <RotateCcw size={15} />
                  清空选区
                </button>
              </div>
              <details className={styles.rectangle}>
                <summary>用数值添加矩形选区</summary>
                <p>以图片宽高的百分比定位，也可使用键盘填写。</p>
                <div className={styles.twoColumns}>
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <label key={key}>
                      {{ x: '左侧位置', y: '顶部位置', width: '选区宽度', height: '选区高度' }[key]}
                      （%）
                      <input
                        type="number"
                        min={key === 'x' || key === 'y' ? 0 : 1}
                        max="100"
                        value={rectangle[key]}
                        onChange={(event) =>
                          setRectangle((current) => ({
                            ...current,
                            [key]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button type="button" className="studio-secondary" onClick={addRectangle}>
                  添加矩形
                </button>
              </details>
              <label>
                修改说明
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={instructions}
                  placeholder="例如：将选中的桌面改成浅灰色石材。"
                  onChange={(event) => setInstructions(event.target.value)}
                />
              </label>
            </fieldset>
            <p className={styles.muted}>{modelName} · 本次生成 1 张修改版本</p>
          </div>
        </div>
        <footer className={styles.dialogFooter}>
          <div className={styles.dialogFooterTools}>
            <span aria-live="polite">
              {marks.length ? `已添加 ${marks.length} 处选区` : '先选择需要修改的区域'}
            </span>
            <button type="button" className="studio-secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
          </div>
          <GenerationFooter
            cost={cost}
            label={busy ? '正在提交…' : '生成修改版本'}
            busy={busy}
            disabled={busy || !marks.length || !instructions.trim()}
            popoverContainer={panel.current}
            onSubmit={() => void submit()}
          >
            {(submissionError || error) && (
              <p role="alert" className={styles.error}>
                {submissionError || error}
              </p>
            )}
          </GenerationFooter>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
