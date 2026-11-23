'use client'

import { AlertTriangle, Check, Loader2, Maximize2, RotateCcw, Sparkles, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../use-dialog-focus'
import { useOverlayContainer } from '../overlay-root'
import type { DraftStatus } from './use-creation-draft'
import styles from './prompt-editor.module.css'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder: string
  enhance?: (value: string) => string | Promise<string>
  enhanceLabel?: string
  enhanceDisabledReason?: string
  helper?: string
  maxLength?: number
  /** Use a shorter inline writing area in the general workbench. */
  compact?: boolean
  collapsed?: boolean
  actions?: ReactNode
  draftStatus?: DraftStatus
  draftError?: string
  onRetryDraft?: () => Promise<void>
}

function usePromptHeight(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  hidden: boolean,
) {
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || hidden) return
    const resize = () => {
      const scrollTop = node.scrollTop
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight}px`
      node.scrollTop = scrollTop
    }
    resize()
    // Wrapping changes when the panel is docked or the viewport is resized.
    let width = node.clientWidth
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (node.clientWidth === width) return
            width = node.clientWidth
            resize()
          })
    observer?.observe(node)
    window.addEventListener('resize', resize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [ref, value, hidden])
}

interface TextPosition {
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}
function positionOf(node: HTMLTextAreaElement): TextPosition {
  return { start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection }
}

function PromptDialog({
  title,
  count,
  input,
  footer,
  onClose,
}: {
  title: string
  count: ReactNode
  input: ReactNode
  footer: ReactNode
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const titleId = useId()
  const container = useOverlayContainer() ?? document.body
  // The parent sets the selection before focusing the textarea so the browser reveals its caret.
  useDialogFocus(dialogRef, onClose, 'button', container)
  useLayoutEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const fitViewport = () => {
      backdropRef.current?.style.setProperty('--prompt-viewport-height', `${viewport.height}px`)
      backdropRef.current?.style.setProperty('--prompt-viewport-top', `${viewport.offsetTop}px`)
    }
    fitViewport()
    viewport.addEventListener('resize', fitViewport)
    viewport.addEventListener('scroll', fitViewport)
    return () => {
      viewport.removeEventListener('resize', fitViewport)
      viewport.removeEventListener('scroll', fitViewport)
    }
  }, [])
  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
        event.stopPropagation()
      }}
      onDrop={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDownCapture={(event) => {
          // Escape belongs to the IME while a Chinese/Japanese candidate is being chosen.
          if (
            event.key === 'Escape' &&
            (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)
          )
            event.stopPropagation()
        }}
      >
        <header className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {title} · 大窗编辑
          </h2>
          <div className={styles.meta}>
            {count}
            <button
              type="button"
              className={styles.close}
              aria-label="关闭大窗编辑"
              title="关闭大窗编辑"
              onClick={onClose}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={styles.dialogEditor}>{input}</div>
        <div className={styles.dialogFooter} data-prompt-scroll>
          {footer}
        </div>
      </div>
    </div>,
    container,
  )
}

/** Both views write directly to the same controlled workbench draft. */
export function PromptEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  enhance,
  enhanceLabel = 'AI 优化提示词',
  enhanceDisabledReason,
  helper,
  maxLength = 10000,
  compact = false,
  collapsed = false,
  actions,
  draftStatus,
  draftError,
  onRetryDraft,
}: PromptEditorProps) {
  const [expanded, setExpanded] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [justEnhanced, setJustEnhanced] = useState(false)
  const [error, setError] = useState('')
  const [blockedHint, setBlockedHint] = useState(false)
  const [previousValue, setPreviousValue] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const largeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const position = useRef<TextPosition | null>(null)
  const restoreFocus = useRef(false)
  const currentValue = useRef(value)
  const mounted = useRef(true)
  const inputRevision = useRef(0)
  if (currentValue.current !== value) inputRevision.current++
  currentValue.current = value
  const hintId = useId()
  const countId = useId()
  const textareaId = useId()
  usePromptHeight(textareaRef, value, collapsed)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function closeLargeEditor() {
    if (largeTextareaRef.current) position.current = positionOf(largeTextareaRef.current)
    restoreFocus.current = !collapsed
    setExpanded(false)
  }

  useLayoutEffect(() => {
    if (!restoreFocus.current) return
    const node = expanded ? largeTextareaRef.current : textareaRef.current
    if (!node || !position.current) return
    restoreFocus.current = false
    const { start, end, direction } = position.current
    node.setSelectionRange(start, end, direction)
    // A normal focus reveals a long-text caret; preventScroll would leave it offscreen.
    node.focus()
  }, [expanded])

  useEffect(() => {
    if (collapsed) {
      restoreFocus.current = false
      setExpanded(false)
    }
  }, [collapsed])
  useEffect(() => {
    if (!enhanceDisabledReason) setBlockedHint(false)
  }, [enhanceDisabledReason])

  function edit(next: string) {
    inputRevision.current++
    currentValue.current = next
    onChange(next)
    setJustEnhanced(false)
    setError('')
  }

  async function runEnhance() {
    if (!enhance || isEnhancing) return
    if (enhanceDisabledReason) {
      setBlockedHint(true)
      setJustEnhanced(false)
      return
    }
    if (Array.from(value).length > maxLength) {
      setError(`描述超过 ${maxLength} 字，请精简后再优化`)
      return
    }
    setBlockedHint(false)
    setIsEnhancing(true)
    setError('')
    setJustEnhanced(false)
    const original = value
    const revision = inputRevision.current
    try {
      const next = await enhance(original)
      if (!mounted.current) return
      if (inputRevision.current !== revision || currentValue.current !== original) {
        setError('描述已更改，优化结果未覆盖当前编辑，请确认后再优化')
        return
      }
      if (next.trim()) {
        setPreviousValue(original)
        edit(next)
        setJustEnhanced(true)
      } else setError('AI 没有返回内容，请重试')
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : 'AI 处理失败，请稍后重试')
    } finally {
      if (mounted.current) setIsEnhancing(false)
    }
  }

  function undo() {
    if (previousValue === null) return
    edit(previousValue)
    setPreviousValue(null)
  }

  const characterCount = Array.from(value).length
  const overLimit = characterCount > maxLength
  const blocked = Boolean(enhanceDisabledReason)
  const count = (
    <span className={`${styles.count}${overLimit ? ` ${styles.overLimit}` : ''}`}>
      {characterCount.toLocaleString('en-US')} / {maxLength.toLocaleString('en-US')}
    </span>
  )
  const note = error || (blockedHint && enhanceDisabledReason)
  const toolbar = (
    <div className={styles.toolbar}>
      <div className={styles.secondaryActions}>{actions}</div>
      <div className={styles.primaryActions}>
        {previousValue !== null && (
          <button
            className={`prompt-undo ${styles.action}`}
            type="button"
            onClick={undo}
            title="恢复到改写前的描述"
          >
            <RotateCcw size={14} aria-hidden="true" />
            撤销
          </button>
        )}
        {enhance && (
          <button
            className={`prompt-enhance ${styles.action}`}
            type="button"
            disabled={isEnhancing}
            aria-describedby={blocked && blockedHint ? hintId : undefined}
            title={isEnhancing ? '正在处理…' : (helper ?? '用 AI 整理当前描述')}
            onClick={() => void runEnhance()}
          >
            {isEnhancing ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            {isEnhancing ? '正在处理…' : enhanceLabel}
          </button>
        )}
      </div>
    </div>
  )
  const feedback = note ? (
    <p id={hintId} className={`${styles.note} ${styles.error}`} role="alert">
      <AlertTriangle size={14} aria-hidden="true" />
      {note}
      {error && (
        <button
          className={`prompt-retry ${styles.action}`}
          type="button"
          onClick={() => void runEnhance()}
        >
          重试
        </button>
      )}
    </p>
  ) : justEnhanced ? (
    <p className={styles.note}>
      <Check size={14} aria-hidden="true" />
      已重新组织描述，可点「撤销」还原
    </p>
  ) : helper ? (
    <p className={styles.note}>{helper}</p>
  ) : null

  const draftMessage =
    draftStatus === 'error'
      ? draftError || '草稿暂时未保存，请重试'
      : draftStatus === 'saving'
        ? '保存草稿中…'
        : draftStatus === 'saved'
          ? '草稿已保存到本机'
          : draftStatus === 'loading'
            ? '正在恢复草稿…'
            : '编辑内容实时同步到工作台'

  return (
    <>
      <div
        className={`${styles.editor}${compact ? ` ${styles.compact}` : ''}`}
        aria-hidden={expanded || undefined}
        inert={expanded || undefined}
      >
        <div className={styles.heading}>
          <label htmlFor={textareaId} className={styles.label}>
            {ariaLabel}
          </label>
          <div className={styles.meta}>
            <span id={countId}>{count}</span>
            <button
              type="button"
              className={styles.expand}
              aria-label="大窗编辑"
              aria-haspopup="dialog"
              onClick={() => {
                if (textareaRef.current) position.current = positionOf(textareaRef.current)
                restoreFocus.current = true
                setExpanded(true)
              }}
            >
              <Maximize2 size={14} aria-hidden="true" />
              大窗编辑
            </button>
          </div>
        </div>
        <textarea
          id={textareaId}
          ref={textareaRef}
          className={`prompt-input ${styles.input}`}
          data-prompt-scroll
          aria-label={ariaLabel}
          aria-describedby={countId}
          aria-invalid={overLimit || undefined}
          placeholder={placeholder}
          value={value}
          readOnly={expanded}
          onChange={(event) => edit(event.target.value)}
        />
        {!expanded && (
          <>
            {toolbar}
            {feedback}
          </>
        )}
      </div>
      {expanded && (
        <PromptDialog
          title={ariaLabel}
          count={count}
          onClose={closeLargeEditor}
          input={
            <textarea
              ref={largeTextareaRef}
              className={styles.dialogInput}
              data-prompt-scroll
              aria-label={ariaLabel}
              aria-invalid={overLimit || undefined}
              placeholder={placeholder}
              value={value}
              onChange={(event) => edit(event.target.value)}
            />
          }
          footer={
            <>
              {toolbar}
              {feedback}
              <p
                className={`${styles.note}${draftStatus === 'error' ? ` ${styles.error}` : ''}`}
                role="status"
              >
                {draftMessage}
                {draftStatus === 'error' && onRetryDraft && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => void onRetryDraft().catch(() => {})}
                  >
                    重试保存
                  </button>
                )}
              </p>
            </>
          }
        />
      )}
    </>
  )
}
