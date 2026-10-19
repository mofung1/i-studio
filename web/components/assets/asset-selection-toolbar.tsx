'use client'

import {
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  FolderInput,
  LoaderCircle,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { FavoriteStar } from '@/components/favorite-star'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface SelectionAction {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

function SelectionMenu({
  label,
  children,
  actions,
  hint,
  disabled,
  className = '',
}: {
  label: string
  children: ReactNode
  actions: SelectionAction[]
  hint?: string
  disabled: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  function items() {
    return Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    ).filter((item) => getComputedStyle(item).display !== 'none')
  }
  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
    function outside(event: PointerEvent) {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    function resize() {
      setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', resize)
    }
  }, [open])
  return (
    <div
      className={`asset-selection-menu ${className}`}
      ref={host}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) setOpen(true)
            else (event.key === 'ArrowUp' ? items().at(-1) : items()[0])?.focus()
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div
          className="asset-selection-dropdown"
          id={id}
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const available = items()
            const index = available.indexOf(document.activeElement as HTMLButtonElement)
            let next: number
            if (event.key === 'ArrowDown') next = (index + 1) % available.length
            else if (event.key === 'ArrowUp')
              next = (index - 1 + available.length) % available.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = available.length - 1
            else return
            event.preventDefault()
            available[next]?.focus()
          }}
        >
          {actions.map((action) => (
            <button
              type="button"
              role="menuitem"
              key={action.label}
              disabled={action.disabled || disabled}
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
                action.onClick()
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          {hint && <p className="asset-selection-hint">{hint}</p>}
        </div>
      )}
    </div>
  )
}

export function AssetSelectionToolbar({
  count,
  loadedCount,
  allFavorite,
  busy,
  error,
  notice,
  onSelectLoaded,
  onClear,
  onDownload,
  onMove,
  onFavorite,
  onExit,
}: {
  count: number
  loadedCount: number
  allFavorite: boolean
  busy: string
  error: string
  notice: string
  onSelectLoaded: () => void
  onClear: () => void
  onDownload: () => void
  onMove: () => void
  onFavorite: () => void
  onExit: () => void
}) {
  const disabled = !!busy
  const actionDisabled = disabled || count === 0
  const favoriteLabel = allFavorite ? '取消收藏' : '收藏'
  return (
    <div
      className="asset-selection-toolbar"
      role="group"
      aria-label="图片批量操作"
      aria-busy={disabled}
    >
      <SelectionMenu
        label={`已选 ${count} 张，选择范围`}
        disabled={disabled}
        actions={[
          {
            label: '选择已加载图片',
            icon: <CheckCheck size={15} aria-hidden="true" />,
            onClick: onSelectLoaded,
          },
          { label: '清空选择', icon: <X size={15} aria-hidden="true" />, onClick: onClear },
        ]}
        hint={`已加载 ${loadedCount} 张，一次最多选择 100 张。`}
      >
        <span className="asset-selection-check">
          <Check size={12} aria-hidden="true" />
        </span>
        <span aria-live="polite" aria-atomic="true" aria-label={`已选 ${count} 张`}>
          <span className="asset-selection-count-prefix">已选 </span>
          <strong>{count}</strong> 张
        </span>
        <ChevronDown size={13} aria-hidden="true" />
      </SelectionMenu>
      <span className="asset-selection-divider" aria-hidden="true" />
      <div className="asset-selection-actions">
        <button
          type="button"
          className="asset-selection-download"
          disabled={actionDisabled}
          onClick={onDownload}
        >
          {busy === 'download' ? (
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <Download size={15} aria-hidden="true" />
          )}
          {busy === 'download' ? '下载中…' : count === 1 ? '下载原图' : '打包下载'}
        </button>
        <button
          type="button"
          className="asset-selection-desktop"
          disabled={actionDisabled}
          onClick={onMove}
        >
          <FolderInput size={15} aria-hidden="true" />
          移至项目
        </button>
        <button
          type="button"
          className="asset-selection-desktop"
          disabled={actionDisabled}
          onClick={onFavorite}
        >
          {busy === 'favorite' ? (
            <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <FavoriteStar size={15} active={allFavorite} />
          )}
          {favoriteLabel}
        </button>
      </div>
      <SelectionMenu
        label="更多图片操作"
        className="asset-selection-more"
        disabled={disabled}
        actions={[
          {
            label: '移至项目',
            icon: <FolderInput size={15} aria-hidden="true" />,
            onClick: onMove,
            disabled: actionDisabled,
          },
          {
            label: favoriteLabel,
            icon: <FavoriteStar size={15} active={allFavorite} />,
            onClick: onFavorite,
            disabled: actionDisabled,
          },
        ]}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        <span className="asset-selection-more-label">更多</span>
      </SelectionMenu>
      <button
        type="button"
        className="asset-selection-cancel"
        aria-label="退出批量管理"
        title="退出批量管理（Esc）"
        disabled={disabled}
        onClick={onExit}
      >
        <X size={17} aria-hidden="true" />
      </button>
      {(error || notice) && (
        <div
          className={`asset-selection-feedback${error ? ' is-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
        </div>
      )}
    </div>
  )
}
