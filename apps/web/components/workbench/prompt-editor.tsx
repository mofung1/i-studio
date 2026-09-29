'use client'

import { AlertTriangle, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder: string
  /** 点击「AI 优化提示词 / AI 帮写」后生成的新文本；不传则不显示该按钮 */
  enhance?: (value: string) => string | Promise<string>
  enhanceLabel?: string
  /** 不满足条件时（例如既没有图片也没有文字）给出禁用原因 */
  enhanceDisabledReason?: string
  helper?: string
  maxLength?: number
}

/** 提示词输入：比普通字段更醒目，带自增高、字数、AI 优化/帮写与状态提示。 */
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
}: PromptEditorProps) {
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [justEnhanced, setJustEnhanced] = useState(false)
  const [error, setError] = useState('')
  // 点按钮时如果既没有图片也没有文字，就地给一次明确提示（按钮不禁用，避免“点了没反应”）
  const [blockedHint, setBlockedHint] = useState(false)
  // 记住改写前的原文，随时可以撤销
  const [previousValue, setPreviousValue] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  // 输入时自增高：最少 5 行，最多 12 行，超过后内部滚动
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 300)}px`
  }, [value])

  // 条件满足后自动收起拦截提示
  useEffect(() => {
    if (!enhanceDisabledReason) setBlockedHint(false)
  }, [enhanceDisabledReason])

  async function runEnhance() {
    if (!enhance || isEnhancing) return
    if (enhanceDisabledReason) {
      setBlockedHint(true)
      setJustEnhanced(false)
      return
    }
    setBlockedHint(false)
    setIsEnhancing(true)
    setError('')
    setJustEnhanced(false)
    const original = value
    try {
      const next = await enhance(value)
      if (next.trim()) {
        setPreviousValue(original)
        onChange(next)
        setJustEnhanced(true)
      } else {
        setError('AI 没有返回内容，请重试')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 处理失败，请稍后重试')
    } finally {
      setIsEnhancing(false)
    }
  }

  function undo() {
    if (previousValue === null) return
    onChange(previousValue)
    setPreviousValue(null)
    setJustEnhanced(false)
    setError('')
  }

  const overLimit = value.length > maxLength
  const blocked = Boolean(enhanceDisabledReason)

  return (
    <div className="prompt-editor">
      <textarea
        ref={textareaRef}
        className="prompt-input"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setJustEnhanced(false)
          setError('')
        }}
      />

      <div className="prompt-editor-bar">
        <span className={`prompt-count ${overLimit ? 'is-over' : ''}`}>{value.length}/{maxLength}</span>
        <div className="prompt-editor-actions">
          {previousValue !== null && (
            <button className="prompt-undo" type="button" onClick={undo} title="恢复到改写前的描述">
              <RotateCcw size={13} aria-hidden="true" />撤销
            </button>
          )}
          {enhance && (
            <button
              className={`prompt-enhance ${blocked ? 'is-blocked' : ''}`}
              type="button"
              disabled={isEnhancing}
              aria-describedby={blocked ? hintId : undefined}
              title={enhanceDisabledReason ?? (isEnhancing ? '正在处理…' : '用 AI 把当前描述整理得更专业')}
              onClick={() => void runEnhance()}
            >
              {isEnhancing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {isEnhancing ? '正在处理…' : enhanceLabel}
            </button>
          )}
        </div>
      </div>

      {(error || (blockedHint && enhanceDisabledReason)) ? (
        <p className="prompt-note is-error" role="alert">
          <AlertTriangle size={13} aria-hidden="true" />
          {error || enhanceDisabledReason}
          {error && <button className="prompt-retry" type="button" onClick={() => void runEnhance()}>重试</button>}
        </p>
      ) : enhanceDisabledReason ? (
        <p className="prompt-note" id={hintId}><AlertTriangle size={13} aria-hidden="true" />{enhanceDisabledReason}</p>
      ) : justEnhanced ? (
        <p className="prompt-note"><Check size={13} aria-hidden="true" />已重新组织描述，可点「撤销」还原</p>
      ) : helper ? <p className="prompt-note">{helper}</p> : null}
    </div>
  )
}
