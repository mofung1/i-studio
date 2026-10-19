'use client'

import { Check, Download, FolderInput, Maximize2, Pencil, Trash2 } from 'lucide-react'
import { FavoriteStar } from '@/components/favorite-star'
import { AssetImageCover } from '@/components/asset-image-cover'
import { taskModeLabel } from '@/components/workbench/use-task-history'
import { assetTitle, formatLibraryDate, type LibraryAsset } from '@/lib/library'

interface AssetGridProps {
  assets: LibraryAsset[]
  selected: string[]
  selectionMode: boolean
  density: 'comfortable' | 'compact'
  busy: boolean
  onPreview: (asset: LibraryAsset) => void
  onSelect: (id: string) => void
  onFavorite: (asset: LibraryAsset) => void
  onTag: (tag: string) => void
  onEdit: (asset: LibraryAsset) => void
  onDownload: (asset: LibraryAsset) => void
  onDelete: (asset: LibraryAsset) => void
  onMove: (asset: LibraryAsset) => void
}

export function AssetGrid({
  assets,
  selected,
  selectionMode,
  density,
  busy,
  onPreview,
  onSelect,
  onFavorite,
  onTag,
  onEdit,
  onDownload,
  onDelete,
  onMove,
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
            onOpen={() => (selectionMode ? onSelect(asset.id) : onPreview(asset))}
            openLabel={
              selectionMode
                ? `${selected.includes(asset.id) ? '取消选择' : '选择'} ${assetTitle(asset)}`
                : undefined
            }
            selected={selectionMode ? selected.includes(asset.id) : undefined}
            disabled={selectionMode && busy}
          >
            {selectionMode && (
              <button
                type="button"
                className="asset-cover-preview"
                aria-label={`查看 ${assetTitle(asset)}`}
                onClick={() => onPreview(asset)}
              >
                <Maximize2 size={15} aria-hidden="true" />
              </button>
            )}
          </AssetImageCover>
          {selectionMode && (
            <label className="asset-checkbox">
              <input
                type="checkbox"
                aria-label={`选择 ${assetTitle(asset)}`}
                checked={selected.includes(asset.id)}
                disabled={busy}
                onChange={() => onSelect(asset.id)}
              />
              <Check size={13} aria-hidden="true" />
            </label>
          )}
          <button
            className={`asset-star${asset.favorite ? ' is-favorite' : ''}`}
            aria-label={
              asset.favorite ? `取消收藏 ${assetTitle(asset)}` : `收藏 ${assetTitle(asset)}`
            }
            aria-pressed={asset.favorite}
            disabled={!!busy}
            onClick={() => onFavorite(asset)}
          >
            <FavoriteStar active={asset.favorite} />
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
            <button
              type="button"
              title="整理图片"
              aria-label={`整理 ${assetTitle(asset)}`}
              disabled={busy}
              onClick={() => onEdit(asset)}
            >
              <Pencil size={14} />
              <span className="asset-card-edit-label">整理</span>
            </button>
            <button
              type="button"
              title="移至项目"
              aria-label={`移动 ${assetTitle(asset)} 至项目`}
              disabled={busy}
              onClick={() => onMove(asset)}
            >
              <FolderInput size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              title="下载原图"
              disabled={busy}
              aria-label={`下载 ${assetTitle(asset)}`}
              onClick={() => onDownload(asset)}
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              title="删除图片"
              disabled={busy}
              aria-label={`删除 ${assetTitle(asset)}`}
              onClick={() => onDelete(asset)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
