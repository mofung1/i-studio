'use client'

import { Package, Sparkles, WandSparkles } from 'lucide-react'

import { Brand } from '@/components/brand'

import type { WorkbenchView } from '../workbench'
import { type WorkbenchMode } from './shared'

interface WorkbenchRailProps {
  mode: WorkbenchMode
  view: WorkbenchView
  onChangeMode: (mode: WorkbenchMode) => void
  onChangeView: (view: WorkbenchView) => void
}

/** 工作台左侧菜单：通用生图 / 电商设计 / 灵感 */
export function WorkbenchRail({ mode, view, onChangeMode, onChangeView }: WorkbenchRailProps) {
  return (
    <aside className="workbench-rail" aria-label="工作台菜单">
      <div className="workbench-rail-brand"><Brand /></div>
      <nav className="workbench-rail-nav">
        <button
          type="button"
          aria-pressed={view === 'create' && mode === 'general'}
          className={view === 'create' && mode === 'general' ? 'active' : ''}
          onClick={() => onChangeMode('general')}
        >
          <WandSparkles size={20} aria-hidden="true" />
          <span>通用生图</span>
        </button>
        <button
          type="button"
          aria-pressed={view === 'create' && mode === 'commerce'}
          className={view === 'create' && mode === 'commerce' ? 'active' : ''}
          onClick={() => onChangeMode('commerce')}
        >
          <Package size={20} aria-hidden="true" />
          <span>电商设计</span>
        </button>
        <button
          type="button"
          aria-pressed={view === 'inspire'}
          className={view === 'inspire' ? 'active' : ''}
          onClick={() => onChangeView('inspire')}
        >
          <Sparkles size={20} aria-hidden="true" />
          <span>灵感</span>
        </button>
      </nav>
    </aside>
  )
}
