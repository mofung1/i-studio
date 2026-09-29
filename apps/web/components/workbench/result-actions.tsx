'use client'

import { Download, Pencil, RefreshCw } from 'lucide-react'

interface ResultActionsProps {
  isBusy: boolean
  onDownload: () => void
  /** 用当前左侧的配置再生成一次 */
  onRegenerate: () => void
  /** 打开查看器，支持放大与裁剪 */
  onEdit: () => void
}

/** 当前任务结果的操作栏。 */
export function ResultActions({ isBusy, onDownload, onRegenerate, onEdit }: ResultActionsProps) {
  return (
    <div className="result-actions">
      <button
        type="button"
        className="result-action-primary"
        title="用当前左侧配置再生成一次"
        disabled={isBusy}
        onClick={onRegenerate}
      >
        <RefreshCw size={15} aria-hidden="true" />重新生成
      </button>
      <button type="button" className="result-action" onClick={onEdit} title="放大查看并裁剪">
        <Pencil size={15} aria-hidden="true" />查看 / 裁剪
      </button>
      <button type="button" className="result-action" onClick={onDownload}>
        <Download size={15} aria-hidden="true" />下载
      </button>
    </div>
  )
}
