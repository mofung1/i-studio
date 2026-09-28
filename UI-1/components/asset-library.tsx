'use client'

import { ArrowRight, Download, Images, ListChecks, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { RegMark } from '@/components/brand'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'

interface GeneratedTask {
  id: string
  status: string
  createdAt: string
  resultImages?: string[]
  input: { productName?: string; prompt?: string; mode?: string; taskType?: string }
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

function statusKind(status: string) {
  if (activeStatuses.has(status)) return 'running'
  if (status === 'succeeded') return 'done'
  if (status === 'failed') return 'failed'
  return 'idle'
}

function taskTitle(task: GeneratedTask) {
  return task.input.productName || task.input.prompt?.slice(0, 24) || taskLabels[task.input.taskType ?? ''] || '通用生图'
}

export function AssetLibrary({ view }: { view: 'images' | 'tasks' }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<GeneratedTask[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(30)
  const [selected, setSelected] = useState<GeneratedImage | null>(null)
  const opener = useRef<HTMLButtonElement>(null)

  const loginHref = `/login?next=${encodeURIComponent(`/assets${view === 'tasks' ? '?view=tasks' : ''}`)}`

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace(loginHref)
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
          router.replace(loginHref)
          return
        }
        if (!response.ok) throw new Error(await readApiError(response, '记录加载失败'))
        const data = (await response.json()) as { tasks?: GeneratedTask[] }
        if (controller.signal.aborted) return
        const latest = (data.tasks ?? []).sort(
          (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
        )
        setTasks(latest)
        setError('')
        if (latest.some((task) => activeStatuses.has(task.status))) timer = window.setTimeout(loadTasks, 5000)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, view])

  useEffect(() => {
    if (!selected) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview()
      if (event.key !== 'Tab') return
      const actions = document.querySelectorAll<HTMLElement>('.lightbox-card button, .lightbox-card a')
      const first = actions.item(0)
      const last = actions.item(actions.length - 1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selected])

  function closePreview() {
    setSelected(null)
    opener.current?.focus()
  }

  const running = tasks.filter((task) => activeStatuses.has(task.status))
  const images = tasks.flatMap((task) => (task.resultImages ?? []).map((path, index) => ({ task, path, index })))

  return (
    <AppShell
      bar={
        <header className="job-bar">
          <div className="job-bar-left">
            <div className="view-switch" role="group" aria-label="资产库视图">
              <Link href="/assets" aria-current={view === 'images' ? 'page' : undefined}>
                <Images size={14} aria-hidden="true" />
                生成图片
              </Link>
              <Link href="/assets?view=tasks" aria-current={view === 'tasks' ? 'page' : undefined}>
                <ListChecks size={14} aria-hidden="true" />
                按任务查看
              </Link>
            </div>
          </div>
          <div className="job-slug">
            <span>资产库</span>
            <strong>{view === 'images' ? '所有已生成的图片' : '所有生成任务'}</strong>
          </div>
          <div className="job-bar-right">
            <Link className="btn btn-primary" href="/">
              <Plus size={15} aria-hidden="true" />
              新建任务
            </Link>
          </div>
        </header>
      }
    >
      <div className="page">
        <div className="page-inner">
          <div className="page-head">
            <div>
              <span className="kicker">archive</span>
              <h1>{view === 'images' ? '生成图片' : '任务记录'}</h1>
              <p>
                {view === 'images'
                  ? `${images.length} 张图片，来自 ${tasks.length} 个任务。`
                  : `${tasks.length} 个任务，其中 ${running.length} 个正在处理。`}
              </p>
            </div>
          </div>

          {error && (
            <p className="notice notice-error" role="alert" style={{ marginTop: 18 }}>
              {error}
            </p>
          )}

          {view === 'images' ? (
            <>
              {running.length > 0 && (
                <section>
                  <div className="section-rule">
                    <h2>正在处理</h2>
                    <span>{running.length} 个</span>
                  </div>
                  <div className="task-rows">
                    {running.map((task) => (
                      <Link className="task-row" href={`/tasks/${task.id}`} key={task.id}>
                        <div className="task-thumbs">
                          <span aria-hidden="true">…</span>
                        </div>
                        <div className="task-info">
                          <strong>{taskTitle(task)}</strong>
                          <span>{taskLabels[task.input.taskType ?? ''] ?? '通用生图'}</span>
                        </div>
                        <span className="status-pill" data-state="running">
                          <i aria-hidden="true" />
                          {statusLabels[task.status]}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <div className="section-rule">
                <h2>联系表</h2>
                <span>{images.length} 张</span>
              </div>

              {loading ? (
                <div className="sheet-grid">
                  {Array.from({ length: 8 }, (_, index) => (
                    <div className="sheet-cell" key={index}>
                      <div className="skeleton" style={{ aspectRatio: '1' }} />
                      <div className="skeleton" style={{ height: 12, width: '70%' }} />
                      <div className="skeleton" style={{ height: 10, width: '45%' }} />
                    </div>
                  ))}
                </div>
              ) : images.length ? (
                <>
                  <div className="sheet-grid">
                    {images.slice(0, visible).map((image) => (
                      <article className="sheet-cell" key={`${image.task.id}-${image.index}`}>
                        <button
                          className="sheet-shot"
                          type="button"
                          aria-label={`预览${taskTitle(image.task)}第${image.index + 1}张`}
                          onClick={(event) => {
                            opener.current = event.currentTarget
                            setSelected(image)
                          }}
                        >
                          <AuthenticatedImage path={image.path} alt={`${taskTitle(image.task)} 第 ${image.index + 1} 张`} />
                          <span className="sheet-index">
                            {String(image.index + 1).padStart(2, '0')}
                          </span>
                        </button>
                        <div className="sheet-meta">
                          <strong>{taskTitle(image.task)}</strong>
                          <span>
                            {taskLabels[image.task.input.taskType ?? ''] ?? '通用生图'} ·{' '}
                            {new Date(image.task.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        <div className="sheet-actions">
                          <Link href={`/tasks/${image.task.id}`}>
                            来源任务
                            <ArrowRight size={13} aria-hidden="true" />
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              void downloadProtectedAsset(
                                image.path,
                                `istudio-${image.task.id.slice(0, 8)}-${image.index + 1}.png`,
                              ).catch(() => setError('下载失败'))
                            }
                          >
                            <Download size={13} aria-hidden="true" />
                            下载
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {images.length > visible && (
                    <button className="load-more" type="button" onClick={() => setVisible((current) => current + 30)}>
                      再看 30 张
                    </button>
                  )}
                </>
              ) : (
                <div className="blank">
                  <RegMark className="blank-mark" />
                  <strong>还没有生成过图片</strong>
                  <p>在工作台提交一次生成，结果会自动归档到这里。</p>
                  <Link className="btn btn-primary" href="/">
                    去工作台
                  </Link>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="section-rule">
                <h2>任务</h2>
                <span>{tasks.length} 个</span>
              </div>
              {loading ? (
                <div className="task-rows">
                  {Array.from({ length: 5 }, (_, index) => (
                    <div className="task-row" key={index}>
                      <div className="skeleton" style={{ height: 46 }} />
                      <div className="skeleton" style={{ height: 14, width: '60%' }} />
                      <div className="skeleton" style={{ height: 26, width: 90 }} />
                    </div>
                  ))}
                </div>
              ) : tasks.length ? (
                <div className="task-rows">
                  {tasks.map((task) => (
                    <Link className="task-row" href={`/tasks/${task.id}`} key={task.id}>
                      <div className="task-thumbs">
                        {task.resultImages?.length ? (
                          task.resultImages.slice(0, 3).map((path, index) => (
                            <AuthenticatedImage key={`${path}-${index}`} path={path} alt={`任务结果 ${index + 1}`} />
                          ))
                        ) : (
                          <span aria-hidden="true">—</span>
                        )}
                      </div>
                      <div className="task-info">
                        <strong>{taskTitle(task)}</strong>
                        <span>
                          {taskLabels[task.input.taskType ?? ''] ?? '通用生图'} ·{' '}
                          {new Date(task.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <span className="status-pill" data-state={statusKind(task.status)}>
                        <i aria-hidden="true" />
                        {statusLabels[task.status] ?? task.status}
                        {task.status === 'succeeded' ? ` · ${task.resultImages?.length ?? 0} 张` : ''}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="blank">
                  <RegMark className="blank-mark" />
                  <strong>还没有任务</strong>
                  <p>先在工作台创建第一张图片。</p>
                  <Link className="btn btn-primary" href="/">
                    去工作台
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <div
            className="lightbox"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePreview()
            }}
          >
            <div className="lightbox-card" role="dialog" aria-modal="true" aria-label="图片预览" style={{ position: 'relative' }}>
              <AuthenticatedImage
                key={selected.path}
                path={selected.path}
                alt={`${taskTitle(selected.task)} 第 ${selected.index + 1} 张`}
              />
              <div className="lightbox-bar">
                <div>
                  <span>{taskTitle(selected.task)}</span>
                  <span className="mono" style={{ color: 'var(--ink-3)' }}>
                    第 {selected.index + 1} 张
                  </span>
                </div>
                <div>
                  <Link className="btn btn-outline" href={`/tasks/${selected.task.id}`}>
                    查看来源任务
                  </Link>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() =>
                      void downloadProtectedAsset(
                        selected.path,
                        `istudio-${selected.task.id.slice(0, 8)}-${selected.index + 1}.png`,
                      ).catch(() => setError('下载失败'))
                    }
                  >
                    <Download size={14} aria-hidden="true" />
                    下载
                  </button>
                </div>
              </div>
              <button
                className="lightbox-close"
                type="button"
                aria-label="关闭预览"
                title="关闭"
                autoFocus
                style={{ position: 'absolute', top: -46, right: 0 }}
                onClick={closePreview}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
