'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { DraftStatus } from './use-creation-draft'

export function CreationDraftStatus({
  status,
  error,
  onRetry,
  onClear,
  disabled = false,
}: {
  status: DraftStatus
  error: string
  onRetry: () => Promise<void>
  onClear: () => Promise<void>
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <span
        className="library-count"
        role="status"
        title={error || '文字、参数和素材仅保存在当前浏览器'}
      >
        {status === 'loading'
          ? '恢复草稿中…'
          : status === 'saving'
            ? '保存草稿中…'
            : status === 'error'
              ? error
              : '草稿已保存到本机'}
      </span>
      {status === 'error' && (
        <button
          type="button"
          className="studio-secondary"
          onClick={() => void onRetry().catch(() => {})}
        >
          重试保存
        </button>
      )}
      <button
        type="button"
        className="studio-secondary"
        disabled={disabled || status === 'loading'}
        onClick={() => setConfirming(true)}
      >
        清空草稿
      </button>
      {confirming && (
        <ConfirmDialog
          title="清空当前草稿？"
          description="当前工具的描述、参数与素材选择将重置，已生成的作品不会删除。"
          confirmLabel="清空草稿"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            void onClear().catch(() => {})
          }}
        />
      )}
    </>
  )
}
