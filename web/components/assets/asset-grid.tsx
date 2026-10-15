'use client'

import { Check, Download, Pencil, Star, Trash2 } from 'lucide-react'
import { AssetImageCover } from '@/components/asset-image-cover'
import { taskModeLabel } from '@/components/workbench/use-task-history'
import { assetTitle, formatLibraryDate, type LibraryAsset } from '@/lib/library'

interface AssetGridProps {
  assets: LibraryAsset[]
  selected: string[]
  density: 'comfortable' | 'compact'
  busy: boolean
  onPreview: (asset: LibraryAsset) => void
  onSelect: (id: string) => void
  onFavorite: (asset: LibraryAsset) => void
  onTag: (tag: string) => void
  onEdit: (asset: LibraryAsset) => void
  onDownload: (asset: LibraryAsset) => void
  onDelete: (asset: LibraryAsset) => void
}

export function AssetGrid({
  assets,
  selected,
  density,
  busy,
  onPreview,
  onSelect,
  onFavorite,
  onTag,
  onEdit,
  onDownload,
  onDelete,
}: AssetGridProps) {
  return (
    <div className={`asset-grid is-${density}`}>
      {assets.map((asset) => (
        <article
          className={`asset-card${selected.includes(asset.id) ? ' is-selected' : ''}`}
          key={asset.id}
        >
          <AssetImageCover
            path={asset.thumbnailPath}
            alt={assetTitle(asset)}
            onOpen={() => onPreview(asset)}
          />
          <label className="asset-checkbox">
            <input
              type="checkbox"
              aria-label={`选择 ${assetTitle(asset)}`}
              checked={selected.includes(asset.id)}
              onChange={() => onSelect(asset.id)}
            />
            <Check size={13} aria-hidden="true" />
          </label>
          <button
            className={`asset-star${asset.favorite ? ' is-favorite' : ''}`}
            aria-label={
              asset.favorite ? `取消收藏 ${assetTitle(asset)}` : `收藏 ${assetTitle(asset)}`
            }
            aria-pressed={asset.favorite}
            disabled={!!busy}
            onClick={() => onFavorite(asset)}
          >
            <Star size={16} fill={asset.favorite ? 'currentColor' : 'none'} />
          </button>
          <div className="asset-card-copy">
            <strong title={assetTitle(asset)}>{assetTitle(asset)}</strong>
            <span>
              {asset.projectName || (asset.task ? taskModeLabel(asset.task.input) : '我的素材')} ·{' '}
              {formatLibraryDate(asset.createdAt)}
            </span>
            {asset.tags.length > 0 && (
              <div className="asset-tags">
                {asset.tags.map((value) => (
                  <button key={value} onClick={() => onTag(value)}>
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="asset-card-actions">
            <button onClick={() => onEdit(asset)}>
              <Pencil size={14} />
              整理
            </button>
            <button aria-label={`下载 ${assetTitle(asset)}`} onClick={() => onDownload(asset)}>
              <Download size={15} />
            </button>
            <button aria-label={`删除 ${assetTitle(asset)}`} onClick={() => onDelete(asset)}>
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
