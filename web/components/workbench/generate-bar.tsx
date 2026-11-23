'use client'

import { Check } from 'lucide-react'
import { useId } from 'react'

import type { GenerationQuote } from '@/lib/credits'
import { useGenerationCost, type CreditHelpNavigation } from '../generation-cost'
import { GenerationFooter } from '../generation-footer'
import type { GenerationNotice } from './use-generation-task'

interface GenerateBarProps {
  modelId?: string
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
  onConfirmCost?: (quote: GenerationQuote) => void
  creditHelp?: CreditHelpNavigation
  buttonLabel?: string
  busyLabel?: string
  disabledReason?: string
  needsProductImage?: boolean
  productImageLabel?: string
}

/** 固定在创作区底部的生成区，不随参数滚动消失。 */
export function GenerateBar({
  modelId,
  title,
  expectedCount,
  aspectRatio,
  resolution,
  notice,
  isSubmitting,
  isGenerating,
  aiEnabled,
  onSubmit,
  onConfirmCost,
  creditHelp,
  buttonLabel,
  busyLabel,
  disabledReason,
  needsProductImage,
  productImageLabel = '商品原图',
}: GenerateBarProps) {
  const noticeId = useId()
  const visibleNotice: GenerationNotice | null = disabledReason
    ? { kind: 'error', message: disabledReason }
    : notice
  const cost = useGenerationCost(modelId, expectedCount)
  const missingImageHint = needsProductImage ? `请先选择${productImageLabel}` : undefined
  const submitLabel = onConfirmCost
    ? (missingImageHint ??
      (cost.quote ? `确认生成 ${cost.quote.quantity} 张` : '确认积分并生成套图'))
    : (buttonLabel ?? `生成${title}`)
  const label = isSubmitting
    ? (busyLabel ?? '正在提交…')
    : isGenerating
      ? '正在生成…'
      : aiEnabled === null
        ? '检查 AI 服务…'
        : aiEnabled === false
          ? '暂无可用模型'
          : submitLabel

  const hint = isGenerating
    ? '当前任务生成中，完成后可以继续提交新任务'
    : aiEnabled === null
      ? '正在检查 AI 服务可用性，请稍候'
      : disabledReason || missingImageHint

  return (
    <footer className="configuration-footer generate-bar">
      <div className="generate-meta">
        <span>
          {expectedCount > 0 ? (
            <>
              预计产出 <strong>{expectedCount}</strong> 张
            </>
          ) : (
            '请先选择图片模块'
          )}
        </span>
        <span className="dot" aria-hidden="true" />
        <span>
          {aspectRatio} · {resolution}
        </span>
      </div>
      <GenerationFooter
        cost={cost}
        label={label}
        busy={isSubmitting || isGenerating}
        disabled={aiEnabled !== true || needsProductImage || Boolean(disabledReason)}
        title={hint}
        describedBy={visibleNotice ? noticeId : undefined}
        creditHelp={creditHelp}
        onSubmit={() => {
          if (!onConfirmCost) onSubmit()
          else if (cost.quote) onConfirmCost(cost.quote)
        }}
      >
        {visibleNotice && (
          <p
            id={noticeId}
            className={`form-notice ${visibleNotice.kind}`}
            role={visibleNotice.kind === 'error' ? 'alert' : 'status'}
          >
            {visibleNotice.kind === 'success' && <Check size={15} aria-hidden="true" />}
            {visibleNotice.message}
          </p>
        )}
      </GenerationFooter>
    </footer>
  )
}
