'use client'

import { Package, WandSparkles } from 'lucide-react'

import { Brand } from '@/components/brand'

import { type WorkbenchMode } from './shared'

interface WorkbenchRailProps {
  mode: WorkbenchMode
  onChangeMode: (mode: WorkbenchMode) => void
}

/** 工作台左侧菜单：通用生图 / 电商设计 */
export function WorkbenchRail({ mode, onChangeMode }: WorkbenchRailProps) {
  return (
    <aside className="workbench-rail" aria-label="工作台菜单">
      <div className="workbench-rail-brand"><Brand /></div>
      <nav className="workbench-rail-nav">
        <button
          type="button"
          aria-pressed={mode === 'general'}
          className={mode === 'general' ? 'active' : ''}
          onClick={() => onChangeMode('general')}
        >
          <WandSparkles size={20} aria-hidden="true" />
          <span>通用生图</span>
        </button>
        <button
          type="button"
          aria-pressed={mode === 'commerce'}
          className={mode === 'commerce' ? 'active' : ''}
          onClick={() => onChangeMode('commerce')}
        >
          <Package size={20} aria-hidden="true" />
          <span>电商设计</span>
        </button>
      </nav>
    </aside>
  )
}
