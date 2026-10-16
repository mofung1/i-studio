'use client'

import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

import {
  Folder,
  History,
  LayoutPanelLeft,
  PanelRight,
  SlidersHorizontal,
  ListFilter,
} from 'lucide-react'
import Link from 'next/link'

import { AccountMenu } from '@/components/account-menu'
import type { CommerceTaskType } from '@/lib/contracts'

import { taskMeta, type ConfigSide, type WorkbenchMode } from './shared'

interface WorkbenchHeaderProps {
  collectionTools?: ReactNode
  mode: WorkbenchMode
  task: CommerceTaskType
  configSide: ConfigSide
  panelOpen: boolean
  onShowDetails: () => void
  historyOpen: boolean
  onToggleHistory: () => void
  onChangeSide: (side: ConfigSide) => void
  onTogglePanel: () => void
}

/** 当前创作上下文与画布辅助操作。 */
export function WorkbenchHeader({
  collectionTools,
  mode,
  task,
  configSide,
  panelOpen,
  historyOpen,
  onShowDetails,
  onToggleHistory,
  onChangeSide,
  onTogglePanel,
}: WorkbenchHeaderProps) {
  const inCommerce = mode === 'commerce'

  return (
    <header className="workbench-nav">
      <div className="studio-breadcrumb">
        {inCommerce ? (
          <>
            <Link href="/commerce">电商工具</Link>
            <span>/</span>
            <strong>{taskMeta[task].title}</strong>
          </>
        ) : (
          <>
            <strong>生图工作区</strong>
          </>
        )}
      </div>

      <div className="workbench-nav-actions">
        {collectionTools}
        <button
          type="button"
          className="studio-secondary header-details"
          aria-label="参数详情"
          title="参数详情"
          onClick={onShowDetails}
        >
          <ListFilter size={16} />
          参数详情
        </button>
        <Link
          className="studio-secondary header-assets"
          href="/assets"
          aria-label="我的资产"
          title="我的资产"
        >
          <Folder size={16} />
          我的资产
        </Link>
        <button
          type="button"
          className={`studio-secondary history-top-trigger ${historyOpen ? 'is-active' : ''}`}
          aria-label="历史记录"
          title="历史记录"
          aria-expanded={historyOpen}
          onClick={onToggleHistory}
        >
          <History size={16} />
          历史记录
        </button>
        <button
          type="button"
          className="panel-toggle"
          aria-controls="creation-settings"
          aria-expanded={panelOpen}
          onClick={onTogglePanel}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          创作设置
        </button>
        {inCommerce && (
          <div className="side-toggle" aria-label="生成配置位置">
            <button
              className={configSide === 'left' ? 'active' : ''}
              type="button"
              aria-label="配置显示在左侧"
              aria-pressed={configSide === 'left'}
              onClick={() => onChangeSide('left')}
            >
              <LayoutPanelLeft size={17} />
            </button>
            <button
              className={configSide === 'right' ? 'active' : ''}
              type="button"
              aria-label="配置显示在右侧"
              aria-pressed={configSide === 'right'}
              onClick={() => onChangeSide('right')}
            >
              <PanelRight size={17} />
            </button>
          </div>
        )}
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  )
}
