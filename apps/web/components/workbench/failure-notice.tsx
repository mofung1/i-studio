'use client'

import { AlertTriangle } from 'lucide-react'

import { splitFailureMessage } from '@/lib/failure-message'

interface FailureNoticeProps {
  message: string
  /** 已有结果时的行内提示，不再重复「生成失败」标题 */
  compact?: boolean
}

/**
 * 生成失败的提示：一句话原因 + 可展开的原始错误详情。
 * 供应商返回的 JSON 很长，直接铺开会把空状态/工具行挤变形，这里统一收进折叠区。
 */
export function FailureNotice({ message, compact = false }: FailureNoticeProps) {
  const { summary, detail } = splitFailureMessage(message)

  return (
    <div className={compact ? 'result-inline-error' : 'result-empty-error'} role="alert">
      <AlertTriangle size={compact ? 14 : 15} aria-hidden="true" />
      <div className="failure-body">
        <p className="failure-summary">
          {!compact && <strong>生成失败</strong>}
          {summary}
        </p>
        {detail !== '' && (
          <details className="failure-details">
            <summary>查看错误详情</summary>
            <pre>{detail}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
