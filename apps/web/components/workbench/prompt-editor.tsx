'use client'

import { Check, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { hasPromptTag } from './shared'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder: string
  /** 点击「AI 优化提示词」后生成的新文本；不传则不显示该按钮 */
  enhance?: (value: string) => string
  enhanceLabel?: string
  /** 快捷标签：点击写入 / 取消 */
  quickTags?: readonly string[]
  onToggleTag?: (tag: string) => void
  /** 结构化字段快捷键：点击补一个「字段：」*/
  fieldHints?: readonly string[]
  onInsertField?: (field: string) => void
  helper?: string
  maxLength?: number
}

/** 提示词输入：比普通字段更醒目，带自增高、字数、AI 优化与快捷标签。 */
export function PromptEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  enhance,
  enhanceLabel = 'AI 优化提示词',
  quickTags,
  onToggleTag,
  fieldHints,
  onInsertField,
  helper,
  maxLength = 10000,
}: PromptEditorProps) {
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [justEnhanced, setJustEnhanced] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef(0)

  // 输入时自增高：最少 5 行，最多 12 行，超过后内部滚动
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 300)}px`
  }, [value])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  function runEnhance() {
    if (!enhance || isEnhancing || !value.trim()) return
    setIsEnhancing(true)
    setJustEnhanced(false)
    window.clearTimeout(timerRef.current)
    // 本地结构化处理本身是同步的，这里刻意留出一段明确的处理反馈
    timerRef.current = window.setTimeout(() => {
      onChange(enhance(value))
      setIsEnhancing(false)
      setJustEnhanced(true)
    }, 620)
  }

  const overLimit = value.length > maxLength

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
        }}
      />

      <div className="prompt-editor-bar">
        <span className={`prompt-count ${overLimit ? 'is-over' : ''}`}>{value.length}/{maxLength}</span>
        {enhance && (
          <button
            className="prompt-enhance"
            type="button"
            disabled={isEnhancing || !value.trim()}
            title={value.trim() ? '把当前描述整理成更结构化的提示词' : '先写下想生成的画面'}
            onClick={runEnhance}
          >
            {isEnhancing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {isEnhancing ? '正在整理…' : enhanceLabel}
          </button>
        )}
      </div>

      {fieldHints && fieldHints.length > 0 && onInsertField && (
        <div className="prompt-fields" role="group" aria-label="需求字段">
          <span className="prompt-fields-label">按需补充</span>
          {fieldHints.map((field) => (
            <button key={field} type="button" onClick={() => onInsertField(field)}>{field}</button>
          ))}
        </div>
      )}

      {quickTags && quickTags.length > 0 && onToggleTag && (
        <div className="prompt-tags" role="group" aria-label="快捷标签">
          {quickTags.map((tag) => {
            const active = hasPromptTag(value, tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                className={active ? 'selected' : ''}
                onClick={() => onToggleTag(tag)}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}

      {justEnhanced ? (
        <p className="prompt-note"><Check size={13} aria-hidden="true" />已重新组织描述</p>
      ) : helper ? <p className="prompt-note">{helper}</p> : null}
    </div>
  )
}
