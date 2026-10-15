'use client'

import { AlertTriangle, Loader2, SlidersHorizontal, Trash2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { AssetImageCover } from '@/components/asset-image-cover'
import { historyWorkbenchUrl } from '@/components/workbench/use-workbench-handoff'
import {
  taskModeLabel,
  taskTitle,
  activeTaskStatuses,
  type HistoryTask,
} from '@/components/workbench/use-task-history'
import { formatLibraryDate } from '@/lib/library'

const statuses: Record<string, string> = {
  queued: '排队中',
  processing: '正在生成',
  waiting_provider: '等待 AI 服务',
  succeeded: '生成完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已过期',
}

interface TaskGridProps {
  tasks: HistoryTask[]
  density: 'comfortable' | 'compact'
  onDetails: (task: HistoryTask) => void
  onDelete: (task: HistoryTask) => void
}

export function TaskGrid({ tasks, density, onDetails, onDelete }: TaskGridProps) {
  return (
    <div className={`asset-grid is-${density}`}>
      {tasks.map((task) => (
        <article className="asset-card" key={task.id}>
          {task.resultImages?.length ? (
            <AssetImageCover
              path={(task.resultImages[0] ?? '').replace(/\/content$/, '/thumbnail')}
              alt={taskTitle(task.input)}
              onOpen={() => onDetails(task)}
            >
              <span className="asset-task-badge">
                {task.resultImages.length} 张 · {statuses[task.status] ?? task.status}
              </span>
            </AssetImageCover>
          ) : task.status === 'failed' ? (
            <button className="asset-cover is-failed" onClick={() => onDetails(task)}>
              <Image
                src="/images/generation-failed.png"
                alt="生成失败，查看原因"
                fill
                sizes="(max-width: 700px) 45vw, (max-width: 1100px) 30vw, 320px"
              />
              <span className="asset-task-badge">
                <AlertTriangle size={14} />
                生成失败 · 查看原因
              </span>
            </button>
          ) : (
            <div className="asset-cover is-empty">
              <Loader2
                size={20}
                className={activeTaskStatuses.has(task.status) ? 'animate-spin' : ''}
              />
              <span>{statuses[task.status]}</span>
            </div>
          )}
          <div className="asset-card-copy">
            <strong>{taskTitle(task.input)}</strong>
            <span>
              {taskModeLabel(task.input)} · {formatLibraryDate(task.createdAt)}
            </span>
          </div>
          <div className="asset-card-actions">
            <Link href={historyWorkbenchUrl(task)}>继续创作</Link>
            <button onClick={() => onDetails(task)} aria-label="查看任务参数">
              <SlidersHorizontal size={15} />
            </button>
            <button
              disabled={activeTaskStatuses.has(task.status)}
              onClick={() => onDelete(task)}
              aria-label="删除任务记录"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
