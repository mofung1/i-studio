'use client'

import { Maximize2, Pencil, ScanText, X } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { AuthenticatedImage } from '@/components/authenticated-image'
import { SavePersonalPrompt } from '@/components/save-personal-prompt'
import { useDialogFocus } from '@/components/use-dialog-focus'
import {
  historyWorkbenchUrl,
  referenceWorkbenchUrl,
} from '@/components/workbench/use-workbench-handoff'
import { assetTitle, formatLibraryDate, type LibraryAsset } from '@/lib/library'

export function AssetPreview({
  asset,
  onClose,
  onEdit,
  onZoom,
  onReverse,
}: {
  asset: LibraryAsset
  onClose: () => void
  onEdit: () => void
  onZoom: () => void
  onReverse: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, onClose)
  const reference = referenceWorkbenchUrl(asset.contentPath, 'general', 'product-main')
  return createPortal(
    <div
      className="dialog-backdrop asset-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="asset-preview"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="作品预览"
      >
        <header>
          <strong>{assetTitle(asset)}</strong>
          <button aria-label="关闭作品预览" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="asset-preview-body">
          <div className="asset-preview-image">
            <AuthenticatedImage path={asset.contentPath} alt={assetTitle(asset)} />
            <button className="asset-preview-zoom" onClick={onZoom}>
              <Maximize2 size={16} />
              放大 / 裁剪
            </button>
          </div>
          <aside>
            <p className="library-count">
              {asset.projectName || '未分类'} · {formatLibraryDate(asset.createdAt)}
            </p>
            <dl className="library-parameters">
              <div>
                <dt>尺寸</dt>
                <dd>
                  {asset.width} × {asset.height}
                </dd>
              </div>
              <div>
                <dt>文件</dt>
                <dd>{(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</dd>
              </div>
              {asset.task && (
                <div>
                  <dt>模型</dt>
                  <dd>{asset.task.input.model}</dd>
                </div>
              )}
            </dl>
            {asset.task && (
              <p className="asset-preview-prompt">
                {asset.task.input.prompt || asset.task.input.requirements || '未填写补充描述'}
              </p>
            )}
            <div className="asset-tags">
              {asset.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="asset-preview-actions">
              {asset.task && (
                <SavePersonalPrompt
                  seed={{
                    title: assetTitle(asset),
                    prompt: asset.task.input.prompt || asset.task.input.requirements || '',
                    source: '生成作品',
                  }}
                />
              )}
              <button className="studio-secondary" onClick={onEdit}>
                <Pencil size={15} />
                编辑名称与标签
              </button>
              <button className="studio-secondary" onClick={onReverse}>
                <ScanText size={15} />
                图片反推
              </button>
              {reference && (
                <Link className="studio-secondary" href={reference}>
                  用作参考图
                </Link>
              )}
              {asset.task && (
                <Link className="studio-primary" href={historyWorkbenchUrl(asset.task)}>
                  继续创作
                </Link>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  )
}
