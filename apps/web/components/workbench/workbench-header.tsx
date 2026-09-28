'use client'

import { Box, Image as ImageIcon, LayoutPanelLeft, Palette, PanelRight, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import Link from 'next/link'

import type { CommerceTaskType } from '@/lib/contracts'

import { commerceTasks, type ConfigSide, type WorkbenchMode } from './shared'
import type { WorkbenchView } from '../workbench'

interface WorkbenchHeaderProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  view: WorkbenchView
  configSide: ConfigSide
  panelOpen: boolean
  onChangeTask: (task: CommerceTaskType) => void
  onChangeSide: (side: ConfigSide) => void
  onTogglePanel: () => void
}

const taskIcons: Record<CommerceTaskType, typeof Box> = {
  'product-main': Box,
  'detail-page': ImageIcon,
  'viral-recreate': Sparkles,
  'product-retouch': Palette,
}

/**
 * 工作台顶栏：主菜单在左侧菜单里，这里只放「电商设计」的四个任务和右侧工具按钮。
 */
export function WorkbenchHeader({
  mode, task, view, configSide, panelOpen, onChangeTask, onChangeSide, onTogglePanel,
}: WorkbenchHeaderProps) {
  const inCommerce = view === 'create' && mode === 'commerce'

  return (
    <header className="workbench-nav">
      {inCommerce ? (
        <nav className="workbench-nav-sub" aria-label="电商设计任务">
          {commerceTasks.map(([taskId, meta]) => {
            const Icon = taskIcons[taskId]
            return (
              <button
                key={taskId}
                type="button"
                title={meta.description}
                aria-pressed={task === taskId}
                className={task === taskId ? 'active' : ''}
                onClick={() => onChangeTask(taskId)}
              >
                <Icon size={15} aria-hidden="true" />{meta.title}
              </button>
            )
          })}
        </nav>
      ) : (
        <span className="workbench-nav-context">{view === 'inspire' ? '灵感提示词' : '通用生图'}</span>
      )}

      <div className="workbench-nav-actions">
        {view === 'create' && (
          <>
            <button
              type="button"
              className="panel-toggle"
              aria-expanded={panelOpen}
              onClick={onTogglePanel}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              {panelOpen ? '收起设置' : '创作设置'}
            </button>
            <div className="side-toggle" aria-label="生成配置位置">
              <button
                className={configSide === 'left' ? 'active' : ''}
                type="button"
                aria-label="配置显示在左侧"
                aria-pressed={configSide === 'left'}
                onClick={() => onChangeSide('left')}
              ><LayoutPanelLeft size={17} /></button>
              <button
                className={configSide === 'right' ? 'active' : ''}
                type="button"
                aria-label="配置显示在右侧"
                aria-pressed={configSide === 'right'}
                onClick={() => onChangeSide('right')}
              ><PanelRight size={17} /></button>
            </div>
          </>
        )}
        <Link className="workbench-close" href="/" aria-label="退出工作台"><X size={18} /></Link>
      </div>
    </header>
  )
}
