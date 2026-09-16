import { Package, WandSparkles } from 'lucide-react'
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
      <button
        className={mode === 'general' ? 'active' : ''}
        type="button"
        aria-pressed={mode === 'general'}
        onClick={() => onChangeMode('general')}
      >
        <WandSparkles size={21} /><span>通用</span>
      </button>
      <button
        className={mode === 'commerce' ? 'active' : ''}
        type="button"
        aria-pressed={mode === 'commerce'}
        onClick={() => onChangeMode('commerce')}
      >
        <Package size={21} /><span>商品</span>
      </button>
    </aside>
  )
}
