'use client'

import { AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight, Clock3, Download, Image as ImageIcon, Loader2, Maximize2, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { InfoDialog } from '@/components/info-dialog'
import { TopNavigation } from '@/components/top-navigation'
import { FailureNotice } from '@/components/workbench/failure-notice'
import { apiBaseUrl, deleteGeneratedAsset, deleteGenerationTask, getAccessToken, readApiError } from '@/lib/api'
import { moduleLabel } from '@/components/workbench/shared'

interface GeneratedTask {
  id: string
  status: string
  createdAt: string
  resultImages?: string[]
  resultModules?: string[]
  errorMessage?: string
  input: { productName?: string; prompt?: string; requirements?: string; mode?: string; taskType?: string }
}

interface GeneratedImage {
  task: GeneratedTask
  path: string
  index: number
}

const taskLabels: Record<string, string> = {
  'product-main': '商品主图',
  'detail-page': '详情页',
  'viral-recreate': '爆款复刻',
  'product-retouch': '产品精修',
}

const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '正在生成',
  waiting_provider: '等待 AI 服务',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已过期',
}

const activeStatuses = new Set(['queued', 'processing', 'waiting_provider'])

function taskTitle(task: GeneratedTask) {
  return task.input.productName
    || task.input.prompt?.slice(0, 24)
    || task.input.requirements?.slice(0, 24)
    || taskLabels[task.input.taskType ?? '']
    || '通用生图'
}

/** 卡片副标题用的短时间：当天只显示时刻，跨天显示月/日 + 时刻 */
function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay ? `今天 ${time}` : `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

function taskTypeLabel(task: GeneratedTask) {
  return taskLabels[task.input.taskType ?? ''] ?? '通用生图'
}

export function AssetLibrary({ view }: { view: 'images' | 'tasks' }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<GeneratedTask[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [visibleImages, setVisibleImages] = useState(30)
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)
  const [deletingKey, setDeletingKey] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<{ kind: 'image'; image: GeneratedImage } | { kind: 'task'; task: GeneratedTask } | null>(null)
  /** 失败记录：点击卡片直接弹窗看原因，不再跳任务详情页 */
  const [infoTask, setInfoTask] = useState<GeneratedTask | null>(null)
  const previewTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(`/assets${view === 'tasks' ? '?view=tasks' : ''}`)}`)
      return
    }

    const controller = new AbortController()
    let timer = 0
    const loadTasks = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/assets${view === 'tasks' ? '?view=tasks' : ''}`)}`)
          return
        }
        if (!response.ok) throw new Error(await readApiError(response, '记录加载失败'))
        const data = await response.json() as { tasks?: GeneratedTask[] }
        if (controller.signal.aborted) return
        const latestTasks = (data.tasks ?? []).sort((first, second) =>
          new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
        setTasks(latestTasks)
        setError('')
        if (latestTasks.some((task) => activeStatuses.has(task.status))) {
          timer = window.setTimeout(loadTasks, 5000)
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : '记录加载失败')
          timer = window.setTimeout(loadTasks, 10000)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadTasks()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [router, view])

  useEffect(() => {
    if (!selectedImage) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview()
      if (event.key === 'ArrowLeft') stepPreview(-1)
      if (event.key === 'ArrowRight') stepPreview(1)
      if (event.key !== 'Tab') return
      const actions = document.querySelectorAll<HTMLElement>('.library-lightbox-content a, .library-lightbox-content button')
      const firstAction = actions.item(0)
      const lastAction = actions.item(actions.length - 1)
      if (!firstAction || !lastAction) return
      if (event.shiftKey && document.activeElement === firstAction) {
        event.preventDefault()
        lastAction.focus()
      } else if (!event.shiftKey && document.activeElement === lastAction) {
        event.preventDefault()
        firstAction.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedImage])

  function closePreview() {
    setSelectedImage(null)
    previewTrigger.current?.focus()
  }

  /** 预览里左右切换同一任务的其它图片 */
  function stepPreview(direction: -1 | 1) {
    setSelectedImage((current) => {
      if (!current) return current
      const images = current.task.resultImages ?? []
      const next = current.index + direction
      const path = images[next]
      if (next < 0 || next >= images.length || !path) return current
      return { ...current, index: next, path }
    })
  }

  /** 删除单张生成图片：连同任务结果里的引用一起清掉 */
  async function removeImage(image: GeneratedImage) {
    const key = `${image.task.id}-${image.index}`
    setDeletingKey(key)
    try {
      await deleteGeneratedAsset(image.path)
      setTasks((current) => current.map((task) => task.id === image.task.id
        ? { ...task, resultImages: (task.resultImages ?? []).filter((path) => path !== image.path) }
        : task))
      if (selectedImage?.path === image.path) setSelectedImage(null)
      setConfirmTarget(null)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败，请稍后重试')
    } finally {
      setDeletingKey('')
    }
  }

  /** 删除整条记录：记录与它生成的所有图片一起删除 */
  async function removeTask(task: GeneratedTask) {
    setDeletingKey(task.id)
    try {
      await deleteGenerationTask(task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      if (selectedImage?.task.id === task.id) setSelectedImage(null)
      setConfirmTarget(null)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败，请稍后重试')
    } finally {
      setDeletingKey('')
    }
  }

  const activeTasks = tasks.filter((task) => activeStatuses.has(task.status))
  const images = tasks.flatMap((task) => (task.resultImages ?? []).map((path, index) => ({ task, path, index })))

  function openPreview(task: GeneratedTask, index: number) {
    const path = task.resultImages?.[index]
    if (!path) return
    setSelectedImage({ task, path, index })
  }

  return <div className="site-shell">
    <TopNavigation />
    <main className="content-page">
    <div className="library-content">
      <header className="library-head">
        <nav className="library-views" aria-label="资产库视图">
          <Link href="/assets" aria-current={view === 'images' ? 'page' : undefined}><ImageIcon size={16} />生成图片</Link>
          <Link href="/assets?view=tasks" aria-current={view === 'tasks' ? 'page' : undefined}><Clock3 size={16} />按任务查看</Link>
        </nav>
      </header>
      {error && <p className="auth-notice" role="alert">{error}</p>}
      {activeTasks.length > 0 && (
        <section className="library-active" aria-label="进行中的任务">
          <h2><Clock3 size={16} />进行中的任务</h2>
          <div className="library-active-list">{activeTasks.map((task) =>
            <Link href={`/tasks/${task.id}`} key={task.id}><span>{taskTitle(task)}</span><strong>{statusLabels[task.status]}</strong></Link>)}</div>
        </section>
      )}

      {loading ? (
        <div className="library-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="library-card is-skeleton" key={index}>
              <span className="library-media" />
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line-narrow" />
            </div>
          ))}
        </div>
      ) : view === 'images' ? (
        images.length ? (
          <>
            <div className="library-grid">
              {images.slice(0, visibleImages).map((image) => {
                const label = moduleLabel(image.task.input.taskType ?? '', image.task.resultModules?.[image.index] ?? '')
                const key = `${image.task.id}-${image.index}`
                return (
                  <article key={key} className="library-card">
                    <button
                      type="button"
                      className="library-media"
                      aria-label={`放大查看${taskTitle(image.task)}第${image.index + 1}张`}
                      onClick={(event) => { previewTrigger.current = event.currentTarget; setSelectedImage(image) }}
                    >
                      <AuthenticatedImage path={image.path} alt={`${taskTitle(image.task)} ${image.index + 1}`} />
                    </button>
                    {label && <span className="library-badge">{label}</span>}
                    <div className="library-media-actions">
                      <button type="button" title="放大查看" aria-label={`放大查看${taskTitle(image.task)}第${image.index + 1}张`} onClick={(event) => { previewTrigger.current = event.currentTarget; setSelectedImage(image) }}>
                        <Maximize2 size={14} />
                      </button>
                      <button type="button" title="下载" aria-label="下载这张图片" onClick={() => void downloadProtectedAsset(image.path, `istudio-${image.task.id.slice(0, 8)}-${image.index + 1}.png`).catch(() => setError('下载失败'))}>
                        <Download size={14} />
                      </button>
                      <button type="button" className="is-danger" title="删除这张图片" aria-label={`删除${taskTitle(image.task)}第${image.index + 1}张图片`} disabled={deletingKey === key} onClick={() => setConfirmTarget({ kind: 'image', image })}>
                        {deletingKey === key ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                    <div className="library-card-meta">
                      <strong>{taskTitle(image.task)}</strong>
                      <span>
                        {taskTypeLabel(image.task) !== taskTitle(image.task) && `${taskTypeLabel(image.task)} · `}
                        {image.index + 1}/{image.task.resultImages?.length ?? 1} · {formatWhen(image.task.createdAt)}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>
            {images.length > visibleImages && <button className="library-load-more" type="button" onClick={() => setVisibleImages((current) => current + 30)}>加载更多图片</button>}
          </>
        ) : (
          <div className="library-empty">
            <p className="empty-state">暂无生成图片，完成的任务结果会自动出现在这里。</p>
            {tasks.length > 0 && <Link href="/assets?view=tasks">查看任务记录</Link>}
          </div>
        )
      ) : (
        tasks.length ? (
          <div className="library-grid">
            {tasks.map((task) => {
              const count = task.resultImages?.length ?? 0
              const status = statusLabels[task.status] ?? task.status
              const badgeClass = task.status === 'failed' ? ' is-failed' : activeStatuses.has(task.status) ? ' is-active' : ''
              return (
                <article key={task.id} className="library-card">
                  {count > 0 ? (
                    <button type="button" className="library-media" aria-label={`放大查看 ${taskTitle(task)} 的生成结果`} onClick={() => openPreview(task, 0)}>
                      <span className={`library-collage${count === 1 ? ' is-single' : ''}`}>
                        {task.resultImages!.slice(0, 3).map((path, index) => (
                          <AuthenticatedImage key={`${path}-${index}`} path={path} alt="" />
                        ))}
                      </span>
                    </button>
                  ) : (
                    <button type="button" className="library-media is-empty" aria-label={`查看 ${taskTitle(task)} 的失败信息`} onClick={() => setInfoTask(task)}>
                      <AlertTriangle size={18} aria-hidden="true" />
                      <span>{status}</span>
                    </button>
                  )}
                  {count > 0 && <span className={`library-badge${badgeClass}`}>{status}</span>}
                  <div className="library-media-actions">
                    {count > 0 ? (
                      <>
                        <Link href={`/tasks/${task.id}`} title="打开任务" aria-label={`打开任务 ${taskTitle(task)}`}>
                          <ArrowUpRight size={14} />
                        </Link>
                        <button type="button" title="下载第一张" aria-label="下载这条记录的第一张图片" onClick={() => {
                          const first = task.resultImages?.[0]
                          if (first) void downloadProtectedAsset(first, `istudio-${task.id.slice(0, 8)}-1.png`).catch(() => setError('下载失败'))
                        }}>
                          <Download size={14} />
                        </button>
                      </>
                    ) : (
                      <button type="button" title="查看失败原因" aria-label={`查看 ${taskTitle(task)} 的失败原因`} onClick={() => setInfoTask(task)}>
                        <AlertTriangle size={14} />
                      </button>
                    )}
                    <button type="button" className="is-danger" title="删除这条记录" aria-label={`删除记录 ${taskTitle(task)}`} disabled={deletingKey === task.id} onClick={() => setConfirmTarget({ kind: 'task', task })}>
                      {deletingKey === task.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                    <div className="library-card-meta">
                      <strong><Link href={`/tasks/${task.id}`}>{taskTitle(task)}</Link></strong>
                      <span>
                        {taskTypeLabel(task) !== taskTitle(task) && `${taskTypeLabel(task)} · `}
                        {count} 张 · {formatWhen(task.createdAt)}
                      </span>
                    </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="library-empty"><p className="empty-state">暂无任务，先创建第一张图片。</p></div>
        )
      )}
    </div>
    {selectedImage && <div className="library-lightbox" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview() }}>
      <div className="library-lightbox-content" role="dialog" aria-modal="true" aria-label="生成图片预览">
        <button type="button" aria-label="关闭预览" title="关闭" autoFocus onClick={closePreview}><X size={20} /></button>
        <AuthenticatedImage key={selectedImage.path} path={selectedImage.path} alt={`${taskTitle(selectedImage.task)} ${selectedImage.index + 1}`} />
        {(selectedImage.task.resultImages?.length ?? 0) > 1 && (
          <>
            <button
              type="button"
              className="library-lightbox-nav is-prev"
              aria-label="上一张"
              disabled={selectedImage.index === 0}
              onClick={() => stepPreview(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="library-lightbox-nav is-next"
              aria-label="下一张"
              disabled={selectedImage.index === (selectedImage.task.resultImages?.length ?? 1) - 1}
              onClick={() => stepPreview(1)}
            >
              <ChevronRight size={18} />
            </button>
            <span className="library-lightbox-counter">{selectedImage.index + 1} / {selectedImage.task.resultImages?.length ?? 0}</span>
          </>
        )}
        <div><span>{taskTitle(selectedImage.task)}</span><Link href={`/tasks/${selectedImage.task.id}`}>查看来源任务</Link><button type="button" onClick={() => void downloadProtectedAsset(selectedImage.path, `istudio-${selectedImage.task.id.slice(0, 8)}-${selectedImage.index + 1}.png`).catch(() => setError('下载失败'))}><Download size={15} />下载</button></div>
      </div>
    </div>}
    </main>
    {confirmTarget && (
      <ConfirmDialog
        title={confirmTarget.kind === 'image' ? '删除这张图片？' : '删除这条记录？'}
        description={confirmTarget.kind === 'image'
          ? `${taskTitle(confirmTarget.image.task)} 第 ${confirmTarget.image.index + 1} 张`
          : `${taskTitle(confirmTarget.task)} · ${new Date(confirmTarget.task.createdAt).toLocaleString('zh-CN')}`}
        detail={confirmTarget.kind === 'image'
          ? '删除后不可恢复，该图片会从记录里移除。'
          : '该次生成的所有图片会一起删除，删除后不可恢复。'}
        confirmLabel="删除"
        busy={confirmTarget.kind === 'image'
          ? deletingKey === `${confirmTarget.image.task.id}-${confirmTarget.image.index}`
          : deletingKey === confirmTarget.task.id}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget.kind === 'image') void removeImage(confirmTarget.image)
          else void removeTask(confirmTarget.task)
        }}
      />
    )}
    {infoTask && (
      <InfoDialog
        title="这条记录生成失败"
        subtitle={`${taskTitle(infoTask)} · ${taskTypeLabel(infoTask)} · ${formatWhen(infoTask.createdAt)}`}
        onClose={() => setInfoTask(null)}
      >
        <FailureNotice message={infoTask.errorMessage || '供应商未返回错误详情，请稍后重试。'} compact />
      </InfoDialog>
    )}
  </div>
}
