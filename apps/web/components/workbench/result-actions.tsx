'use client'

import { Download, Pencil, RefreshCw, Shuffle } from 'lucide-react'

interface ResultActionsProps {
  isBusy: boolean
  /** 当前选中的那张图，用于「下载」 */
  onDownload: () => void
  onRegenerate: () => void
  /** 打开查看器，支持放大与裁剪 */
  onEdit: () => void
}

/**
 * 结果操作栏。只有真正有能力的动作可点，
 * 「生成变体」后端暂不支持，保持禁用态，不制造虚假能力。
 */
export function ResultActions({ isBusy, onDownload, onRegenerate, onEdit }: ResultActionsProps) {
  return (
    <div className="result-actions">
      <button type="button" className="result-action-primary" disabled={isBusy} onClick={onRegenerate}>
        <RefreshCw size={15} aria-hidden="true" />重新生成
      </button>
      <button type="button" className="result-action" disabled title="即将支持">
        <Shuffle size={15} aria-hidden="true" />生成变体
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
