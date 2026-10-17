'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  GripVertical,
  PanelLeftClose,
  PanelRightClose,
  PanelRight,
  PanelLeft,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { usePanelDock } from './use-panel-dock'
import { useCreatorOrb } from './use-creator-orb'
import type { ConfigSide } from './shared'
import type { GenerationNotice } from './use-generation-task'

const COMPACT_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  processing: '正在生成',
  waiting_provider: '等待出图',
  succeeded: '生成完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已超时',
}

interface CreatorPanelProps {
  children: ReactNode
  className: string
  side: ConfigSide
  collapsed: boolean
  onSetSide?: (side: ConfigSide) => void
  onToggle?: () => void
  onResetLayout?: () => void
  currentModel?: string
  notice: GenerationNotice | null
  isSubmitting: boolean
  isGenerating: boolean
  taskStatus?: string | null
  dialog?: boolean
}

/** Shared inspector chrome. Collapsing hides the mounted editor so drafts and uploads survive. */
export function CreatorPanel({
  children,
  className,
  side,
  collapsed,
  onSetSide,
  onToggle,
  onResetLayout,
  currentModel = '',
  notice,
  isSubmitting,
  isGenerating,
  taskStatus,
  dialog = false,
}: CreatorPanelProps) {
  const dock = usePanelDock({
    enabled: !!onSetSide,
    collapsed,
    side,
    onDock: onSetSide,
  })
  const orb = useCreatorOrb({ panelRef: dock.panelRef, enabled: collapsed && !dialog, side })
  const previousSide = useRef(side)
  useEffect(() => {
    if (collapsed || previousSide.current !== side) {
      dock.panelRef.current?.querySelectorAll<HTMLElement>('[popover]').forEach((popover) => {
        try {
          popover.hidePopover?.()
        } catch {
          /* Already dismissed. */
        }
      })
    }
    previousSide.current = side
  }, [collapsed, side, dock.panelRef])
  const configToggleRef = useRef<HTMLButtonElement>(null)
  const wasCollapsed = useRef(collapsed)

  useEffect(() => {
    const body = document.getElementById('creation-settings-body')
    if (
      collapsed &&
      (document.activeElement === document.body || body?.contains(document.activeElement))
    ) {
      configToggleRef.current?.focus()
    } else if (!collapsed && wasCollapsed.current) {
      body?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
    }
    wasCollapsed.current = collapsed
  }, [collapsed])
  const generationStatus = isSubmitting
    ? '正在提交'
    : (COMPACT_STATUS_LABELS[taskStatus ?? ''] ?? (isGenerating ? '正在生成' : '待生成'))

  return (
    <aside
      ref={dock.panelRef}
      id="creation-settings"
      className={`configuration-panel creator-sidebar ${className} ${dock.preview ? 'is-panel-dragging' : ''}`}
      aria-label="创作设置"
      role={dialog ? 'dialog' : undefined}
      aria-modal={dialog || undefined}
    >
      <div className="creator-panel-head">
        <button
          type="button"
          className="creator-drag-handle"
          aria-label="拖动创作面板，或按左右方向键停靠"
          title="拖动停靠至左侧或右侧，Esc 取消"
          {...dock.handleProps}
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <h2>创作设置</h2>
        <span
          className={`creator-panel-status${notice?.kind === 'error' ? ' is-error' : ''}`}
          role="status"
          aria-atomic="true"
          aria-label={notice?.kind === 'error' ? notice.message : generationStatus}
          title={notice?.kind === 'error' ? notice.message : generationStatus}
        >
          {isSubmitting || isGenerating ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : null}
          <span>{notice?.kind === 'error' ? '需处理' : generationStatus}</span>
        </span>
        <div className="creator-layout-actions">
          <button
            type="button"
            aria-label={side === 'left' ? '配置移至右侧' : '配置移至左侧'}
            title={side === 'left' ? '配置移至右侧' : '配置移至左侧'}
            onClick={() => dock.moveTo(side === 'left' ? 'right' : 'left')}
          >
            {side === 'left' ? (
              <PanelRight size={15} aria-hidden="true" />
            ) : (
              <PanelLeft size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="恢复默认创作布局"
            title="恢复默认布局"
            onClick={() => {
              orb.reset()
              onResetLayout?.()
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </div>
        <button
          ref={configToggleRef}
          type="button"
          className="creator-panel-toggle"
          aria-label={collapsed ? '展开创作配置' : '收起创作配置'}
          aria-controls="creation-settings-body"
          aria-expanded={!collapsed}
          aria-description={
            collapsed ? '拖动可在内容区悬停；方向键移动，Home 复位，点击展开' : undefined
          }
          {...(collapsed ? orb.handleProps : {})}
          onClick={(event) => {
            if (!collapsed || orb.shouldExpand(event.detail)) onToggle?.()
          }}
          title={
            collapsed
              ? `点击展开，拖动悬停 · ${notice?.kind === 'error' ? notice.message : isSubmitting || isGenerating ? generationStatus : currentModel}`
              : '收起创作设置，扩大画布'
          }
        >
          {collapsed ? (
            isSubmitting || isGenerating ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : (
              <SlidersHorizontal size={20} aria-hidden="true" />
            )
          ) : side === 'left' ? (
            <PanelLeftClose size={17} aria-hidden="true" />
          ) : (
            <PanelRightClose size={17} aria-hidden="true" />
          )}
        </button>
      </div>
      {children}
      {dock.preview &&
        createPortal(
          <div
            className="creator-dock-preview"
            style={{
              left: dock.preview.left,
              top: dock.preview.top,
              width: dock.preview.width,
              height: dock.preview.height,
            }}
            aria-hidden="true"
          >
            <span>松开停靠到{dock.preview.side === 'left' ? '左侧' : '右侧'}</span>
          </div>,
          document.body,
        )}
    </aside>
  )
}
