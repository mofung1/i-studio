'use client'

import { RotateCcw, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { DialogActions } from '@/components/dialog-actions'
import { GenerationCost, useGenerationCost } from '@/components/generation-cost'
import { useDialogFocus } from '@/components/use-dialog-focus'
import { formatCredits, type GenerationQuote } from '@/lib/credits'

export function RedoImageDialog({
  modelId,
  imageLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  modelId: string
  imageLabel: string
  busy: boolean
  onCancel: () => void
  onSubmit: (requirements: string, quote: GenerationQuote) => Promise<void>
}) {
  const titleId = useId()
  const requirementsId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [requirements, setRequirements] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const cost = useGenerationCost(modelId, 1)
  const locked = busy || submitting

  function close() {
    if (!locked) onCancel()
  }

  useDialogFocus(dialogRef, close, '.confirm-dialog-cancel')

  async function submit() {
    if (locked || !cost.quote?.canAfford) return
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(requirements.trim(), cost.quote)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提交失败，请重试')
      cost.retry()
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="confirm-dialog-head">
          <h2 id={titleId}>只重做这张</h2>
          <button type="button" aria-label="关闭" onClick={close} disabled={locked}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <p className="confirm-dialog-note">重做「{imageLabel}」，新版本和原成片都会保留。</p>
        <div className="confirm-dialog-image-redo">
          <label htmlFor={requirementsId}>调整要求（选填）</label>
          <textarea
            id={requirementsId}
            maxLength={1000}
            rows={3}
            value={requirements}
            placeholder="例如：让盖缝的细节更清楚"
            disabled={locked}
            onChange={(event) => setRequirements(event.target.value)}
          />
        </div>
        <GenerationCost {...cost} />
        {error && (
          <p className="form-notice error" role="alert">
            {error}
          </p>
        )}
        <DialogActions className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" disabled={locked} onClick={close}>
            取消
          </button>
          <button
            type="button"
            className="confirm-dialog-primary"
            disabled={locked || !cost.quote?.canAfford}
            onClick={() => void submit()}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {locked
              ? '正在提交…'
              : cost.quote
                ? `确认 ${formatCredits(cost.quote.totalMinor)} ${cost.quote.creditName}并重做 1 张`
                : '确认费用并重做 1 张'}
          </button>
        </DialogActions>
      </div>
    </div>,
    document.body,
  )
}
