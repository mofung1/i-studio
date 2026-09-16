import { Box, Image as ImageIcon, LayoutPanelLeft, Palette, PanelRight, Sparkles, WandSparkles, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@istudio/ui'

import type { CommerceTaskType } from '@istudio/contracts'

import { commerceTasks, type ConfigSide, type WorkbenchMode } from './shared'

interface WorkbenchHeaderProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  configSide: ConfigSide
  onChangeMode: (mode: WorkbenchMode) => void
  onChangeTask: (task: CommerceTaskType) => void
  onChangeSide: (side: ConfigSide) => void
}

const taskIcons: Record<CommerceTaskType, typeof Box> = {
  'product-main': Box,
  'detail-page': ImageIcon,
  'viral-recreate': Sparkles,
  'product-retouch': Palette,
}

export function WorkbenchHeader({ mode, task, configSide, onChangeMode, onChangeTask, onChangeSide }: WorkbenchHeaderProps) {
  return (
    <header className="workbench-header">
      <div className="mobile-mode-switch" aria-label="生图模式">
        <button
          className={mode === 'general' ? 'active' : ''}
          type="button"
          aria-pressed={mode === 'general'}
          onClick={() => onChangeMode('general')}
        >通用</button>
        <button
          className={mode === 'commerce' ? 'active' : ''}
          type="button"
          aria-pressed={mode === 'commerce'}
          onClick={() => onChangeMode('commerce')}
        >商品</button>
      </div>
      {mode === 'commerce' ? (
        <nav className="task-tabs" aria-label="商品生图任务">
          {commerceTasks.map(([taskId, meta]) => {
            const Icon = taskIcons[taskId]
            return (
              <button
                key={taskId}
                className={task === taskId ? 'active' : ''}
                type="button"
                aria-pressed={task === taskId}
                onClick={() => onChangeTask(taskId)}
              >
                <Icon size={16} />{meta.title}
              </button>
            )
          })}
        </nav>
      ) : <strong className="workbench-title"><WandSparkles size={17} />通用生图</strong>}
      <div className="header-actions">
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
        <Button asChild size="icon" variant="ghost"><Link href="/" aria-label="关闭工作台"><X size={20} /></Link></Button>
      </div>
    </header>
  )
}
