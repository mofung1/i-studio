'use client'

import { Box, Image as ImageIcon, LayoutPanelLeft, Palette, PanelRight, Sparkles, WandSparkles } from 'lucide-react'

import type { CommerceTaskType } from '@/lib/contracts'

import { ServiceState } from '../app-shell'
import { commerceTasks, type ConfigSide, type WorkbenchMode } from './shared'

const taskIcons: Record<CommerceTaskType, typeof Box> = {
  'product-main': Box,
  'detail-page': ImageIcon,
  'viral-recreate': Sparkles,
  'product-retouch': Palette,
}

interface WorkbenchBarProps {
  mode: WorkbenchMode
  task: CommerceTaskType
  configSide: ConfigSide
  aiEnabled: boolean | null
  onChangeMode: (mode: WorkbenchMode) => void
  onChangeTask: (task: CommerceTaskType) => void
  onChangeSide: (side: ConfigSide) => void
}

export function WorkbenchBar({
  mode,
  task,
  configSide,
  aiEnabled,
  onChangeMode,
  onChangeTask,
  onChangeSide,
}: WorkbenchBarProps) {
  return (
    <header className="job-bar">
      <div className="job-bar-left">
        <div className="mode-switch" role="group" aria-label="生图模式">
          <button type="button" aria-pressed={mode === 'general'} onClick={() => onChangeMode('general')}>
            <WandSparkles size={14} aria-hidden="true" />
            通用生图
          </button>
          <button type="button" aria-pressed={mode === 'commerce'} onClick={() => onChangeMode('commerce')}>
            <Box size={14} aria-hidden="true" />
            电商工具
          </button>
        </div>
      </div>

      {mode === 'commerce' ? (
        <nav className="task-tabs" aria-label="商品生图任务">
          {commerceTasks.map(([taskId, meta]) => {
            const Icon = taskIcons[taskId]
            return (
              <button
                key={taskId}
                type="button"
                aria-pressed={task === taskId}
                title={meta.description}
                onClick={() => onChangeTask(taskId)}
              >
                <Icon size={15} aria-hidden="true" />
                {meta.title}
              </button>
            )
          })}
        </nav>
      ) : (
        <span aria-hidden="true" />
      )}

      <div className="job-bar-right">
        <ServiceState aiEnabled={aiEnabled} />
        <div className="tool-cluster panel-side-tools" role="group" aria-label="工单位置">
          <button
            type="button"
            aria-pressed={configSide === 'left'}
            aria-label="工单显示在左侧"
            title="工单显示在左侧"
            onClick={() => onChangeSide('left')}
          >
            <LayoutPanelLeft size={15} />
          </button>
          <button
            type="button"
            aria-pressed={configSide === 'right'}
            aria-label="工单显示在右侧"
            title="工单显示在右侧"
            onClick={() => onChangeSide('right')}
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
