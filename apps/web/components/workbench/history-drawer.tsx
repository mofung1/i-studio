'use client'

import { AlertTriangle, Check, Download, History, Loader2, RefreshCw, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'

import { AuthenticatedImage } from '@/components/authenticated-image'

import type { CommerceTaskType } from '@/lib/contracts'

import { taskModeLabel, taskTitle, useTaskHistory, type HistoryTask } from './use-task-history'
import { type WorkbenchMode } from './shared'

interface HistoryDrawerProps {
  open: boolean
  mode: WorkbenchMode
  task: CommerceTaskType
  selectedId: string | null
  loadingConfigId: string | null
  /** 生成完成后刷新列表 */
  refreshKey: number
  onClose: () => void
  onSelect: (task: HistoryTask) => void
  onDownload: (path: string, filename: string) => void
  onUseAsReference: (path: string, source: { mode: WorkbenchMode; taskType: CommerceTaskType }) => void
  onLoadConfig: (task: HistoryTask) => void
  onRegenerate: (task: HistoryTask) => void
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '生成中',
  waiting_provider: '等待 AI 服务',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已过期',
}

/** 历史记录抽屉：按当前生图类型筛选，支持查看、下载、用作参考图和载入配置。 */
export function HistoryDrawer({
  open, mode, task, selectedId, loadingConfigId, refreshKey,
  onClose, onSelect, onDownload, onUseAsReference, onLoadConfig,
  onRegenerate,
}: HistoryDrawerProps) {
  const [scope, setScope] = useState<'type' | 'all'>('type')
  const { tasks, isLoading, error, reload } = useTaskHistory({
    mode: scope === 'type' ? mode : undefined,
    taskType: task,
    limit: scope === 'type' ? 40 : 60,
    enabled: open,
    refreshKey,
  })

  const typeLabel = mode === 'general' ? '通用生图' : '当前工具'

  return (
    <>
      <div className={`history-backdrop ${open ? 'is-open' : ''}`} role="presentation" onClick={onClose} />
      <aside
        className={`history-drawer ${open ? 'is-open' : ''}`}
        aria-label="历史记录"
        aria-hidden={!open}
      >
        <header className="history-drawer-head">
          <h2><History size={16} aria-hidden="true" />历史记录</h2>
          <button type="button" aria-label="关闭历史记录" title="关闭" onClick={onClose}><X size={17} /></button>
        </header>

        <div className="history-drawer-filter" role="group" aria-label="历史记录范围">
          <button type="button" aria-pressed={scope === 'type'} className={scope === 'type' ? 'is-active' : ''} onClick={() => setScope('type')}>
            {mode === 'general' ? '通用生图' : typeLabel}
          </button>
          <button type="button" aria-pressed={scope === 'all'} className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>全部记录</button>
          <button type="button" className="history-refresh" title="刷新" aria-label="刷新历史记录" onClick={reload}><RotateCcw size={14} /></button>
        </div>

        <div className="history-drawer-body">
          {error && <p className="history-drawer-error" role="alert"><AlertTriangle size={14} aria-hidden="true" />{error}</p>}
          {isLoading && tasks.length === 0 && (
            <p className="history-drawer-loading"><Loader2 size={15} className="animate-spin" aria-hidden="true" />正在加载…</p>
          )}
          {!isLoading && !error && tasks.length === 0 && (
            <div className="history-drawer-empty">
              <History size={20} aria-hidden="true" />
              <strong>还没有历史记录</strong>
            </div>
          )}

          <ol className="history-records">
            {tasks.map((item) => {
              const images = item.resultImages ?? []
              const cover = images[0]
              const selected = item.id === selectedId
              return (
                <li key={item.id} className={selected ? 'history-record is-selected' : 'history-record'}>
                  <button
                    type="button"
                    className="history-record-open"
                    aria-pressed={selected}
                    aria-label={`查看 ${taskModeLabel(item.input)} 的生成结果`}
                    onClick={() => onSelect(item)}
                  >
                    <span className="history-record-thumbs">
                      {images.slice(0, 4).map((path) => (
                        <span key={path} className="history-record-thumb">
                          <AuthenticatedImage path={path} alt="历史生成结果缩略图" />
                        </span>
                      ))}
                      {images.length === 0 && (
                        <span className="history-record-thumb is-empty"><AlertTriangle size={14} aria-hidden="true" /></span>
                      )}
                    </span>
                    <span className="history-record-meta">
                      <span className="history-record-tags">
                        <span className="history-record-tag">{taskModeLabel(item.input)}</span>
                        <span className={`history-record-status is-${item.status}`}>{statusLabels[item.status] ?? item.status}</span>
                      </span>
                      <strong>{taskTitle(item.input)}</strong>
                      <small>{formatTime(item.createdAt)} · {images.length} 张</small>
                    </span>
                  </button>
                  <div className="history-record-actions">
                    <button
                      type="button"
                      title="下载第一张"
                      aria-label="下载这条记录的第一张图片"
                      disabled={!cover}
                      onClick={() => cover && onDownload(cover, `istudio-${item.id.slice(0, 8)}-1.png`)}
                    >
                      <Download size={13} />
                    </button>
                <button
                  type="button"
                  title="把第一张用作参考图"
                  aria-label="把这条记录的第一张图片用作参考图"
                  disabled={!cover}
                  onClick={() => cover && onUseAsReference(cover, {
                    mode: item.input.mode === 'commerce' ? 'commerce' : 'general',
                    taskType: (item.input.taskType as CommerceTaskType) ?? 'product-main',
                  })}
                >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      type="button"
                      className="history-load-config"
                      title="载入这条记录的配置继续编辑"
                      aria-label="载入这条记录的配置"
                      disabled={loadingConfigId === item.id}
                      onClick={() => onLoadConfig(item)}
                    >
                      {loadingConfigId === item.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <SlidersHorizontal size={13} />}
                      载入配置
                    </button>
                    <button
                      type="button"
                      className="history-regenerate"
                      title="用该记录配置重新生成图片"
                      aria-label="用这条记录的配置重新生成"
                      disabled={loadingConfigId === item.id}
                      onClick={() => onRegenerate(item)}
                    >
                      <RefreshCw size={13} />
                      重新生成
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>

          {isLoading && tasks.length > 0 && (
            <p className="history-drawer-loading"><Check size={13} aria-hidden="true" />正在刷新…</p>
          )}
        </div>
      </aside>
    </>
  )
}
