import { Image as ImageIcon, Layers3, Package, Settings } from 'lucide-react'
import Link from 'next/link'

import type { WorkbenchMode } from './shared'

interface ModeRailProps {
  mode: WorkbenchMode
  onChangeMode: (mode: WorkbenchMode) => void
}

export function ModeRail({ mode, onChangeMode }: ModeRailProps) {
  return (
    <aside className="mode-rail" aria-label="生图模式">
      <Link className="compact-brand" href="/" aria-label="返回首页"><span /></Link>
      <nav className="mode-rail-nav" aria-label="创作类型">
        <button
          className={mode === 'general' ? 'active' : ''}
          type="button"
          aria-pressed={mode === 'general'}
          onClick={() => onChangeMode('general')}
        >
          <ImageIcon size={20} /><span>AI 图片</span>
        </button>
        <button
          className={mode === 'commerce' ? 'active' : ''}
          type="button"
          aria-pressed={mode === 'commerce'}
          onClick={() => onChangeMode('commerce')}
        >
          <Package size={20} /><span>电商工具</span>
        </button>
      </nav>
      <span className="mode-rail-divider" />
      <div className="mode-rail-secondary">
        <Link href="/assets" aria-label="资产库"><Layers3 size={19} /><span>资产</span></Link>
        <button type="button" disabled title="设置即将开放"><Settings size={19} /><span>设置</span></button>
      </div>
    </aside>
  )
}
