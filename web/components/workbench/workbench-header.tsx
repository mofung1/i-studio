'use client'

import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'

import { History, SlidersHorizontal, ListFilter } from 'lucide-react'
import Link from 'next/link'

import { AccountMenu } from '@/components/account-menu'
import type { CommerceTaskType } from '@/lib/contracts'

import { taskMeta, type WorkbenchMode } from './shared'

interface WorkbenchHeaderProps {
  collectionTools?: ReactNode
  mode: WorkbenchMode
  task: CommerceTaskType
  panelOpen: boolean
  onShowDetails: () => void
  historyOpen: boolean
  onToggleHistory: () => void
  onTogglePanel: () => void
}

/** 当前创作上下文与画布辅助操作。 */
export function WorkbenchHeader({
  collectionTools,
  mode,
  task,
  panelOpen,
  historyOpen,
  onShowDetails,
  onToggleHistory,
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
          aria-label="创作设置"
          title={panelOpen ? '收起创作设置' : '展开创作设置'}
          aria-controls="creation-settings"
          aria-expanded={panelOpen}
          onClick={onTogglePanel}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          创作设置
        </button>
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  )
}
