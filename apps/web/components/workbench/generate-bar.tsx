'use client'

import { Check, Loader2, Sparkles } from 'lucide-react'

import type { GenerationNotice } from './use-generation-task'

interface GenerateBarProps {
  title: string
  /** 本次预计出图张数 */
  expectedCount: number
  aspectRatio: string
  resolution: string
  notice: GenerationNotice | null
  isSubmitting: boolean
  isGenerating: boolean
  aiEnabled: boolean | null
  onSubmit: () => void
}

/** 固定在创作区底部的生成区，不随参数滚动消失。 */
export function GenerateBar({
  title, expectedCount, aspectRatio, resolution, notice, isSubmitting, isGenerating, aiEnabled, onSubmit,
}: GenerateBarProps) {
  const label = isSubmitting
    ? '正在提交…'
    : isGenerating
      ? '正在生成…'
      : aiEnabled === null
        ? '检查 AI 服务…'
        : `生成${title}`

  const hint = isGenerating
    ? '当前任务生成中，完成后可以继续提交新任务'
    : aiEnabled === null
      ? '正在检查 AI 服务可用性，请稍候'
      : undefined

  return (
    <footer className="configuration-footer generate-bar">
      <div className="generate-meta">
        <span>预计产出 <strong>{expectedCount}</strong> 张</span>
        <span className="dot" aria-hidden="true" />
        <span>{aspectRatio} · {resolution}</span>
      </div>
      {notice && (
        <p className={`form-notice ${notice.kind}`} role="status">
          {notice.kind === 'success' && <Check size={15} aria-hidden="true" />}
          {notice.message}
        </p>
      )}
      <button
        className="generate-button"
        type="button"
        disabled={isSubmitting || isGenerating || aiEnabled === null}
        title={hint}
        onClick={onSubmit}
      >
        {isSubmitting || isGenerating
          ? <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          : <Sparkles size={17} aria-hidden="true" />}
        {label}
      </button>
    </footer>
  )
}
