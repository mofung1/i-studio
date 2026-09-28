'use client'

import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface RegenerateDialogProps {
  title: string
  /** 弹窗里逐条展示的当前配置 */
  rows: ReadonlyArray<readonly [string, string]>
  expectedCount: number
  onCancel: () => void
  onConfirm: () => void
}

const SKIP_KEY = 'istudio-skip-regenerate-confirm'

export function shouldSkipRegenerateConfirm() {
  return typeof window !== 'undefined' && window.localStorage.getItem(SKIP_KEY) === '1'
}

/**
 * 重新生成的二次确认：每一次生成都会真实调用供应商并产生费用，
 * 因此提交前把将要使用的配置摊开给用户确认；勾选后可在本机不再提示。
 */
export function RegenerateDialog({ title, rows, expectedCount, onCancel, onConfirm }: RegenerateDialogProps) {
  const [skipNextTime, setSkipNextTime] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll('button, input')
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
  }, [onCancel])

  function confirm() {
    if (skipNextTime) window.localStorage.setItem(SKIP_KEY, '1')
    onConfirm()
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}
    >
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="regenerate-dialog-title" ref={dialogRef}>
        <header className="confirm-dialog-head">
          <h2 id="regenerate-dialog-title">再生成一张{title}？</h2>
          <button type="button" aria-label="关闭" title="关闭" onClick={onCancel}><X size={17} /></button>
        </header>
        <p className="confirm-dialog-note">将使用当前配置重新提交一次生成任务，每次生成都会调用 AI 服务并产生费用。</p>
        <dl className="confirm-dialog-list">
          {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
          <div><dt>预计产出</dt><dd>{expectedCount} 张</dd></div>
        </dl>
        <label className="confirm-dialog-skip">
          <input type="checkbox" checked={skipNextTime} onChange={(event) => setSkipNextTime(event.target.checked)} />
          <span>以后重新生成不再提示</span>
        </label>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="confirm-dialog-primary" autoFocus onClick={confirm}>
            <Sparkles size={15} aria-hidden="true" />确认生成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
