'use client'

import { ArrowLeft, Clock3, Download, Image as ImageIcon, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
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
  'white-background': '白底精修',
  scene: '商品场景图',
  'selling-point': '卖点主图',
  'detail-page': '详情页单页',
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
  return task.input.productName || task.input.prompt?.slice(0, 24) || taskLabels[task.input.taskType ?? ''] || '通用生图'
}

export function AssetLibrary({ view }: { view: 'images' | 'tasks' }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<GeneratedTask[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [visibleImages, setVisibleImages] = useState(30)
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null)
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

  const activeTasks = tasks.filter((task) => activeStatuses.has(task.status))
  const images = tasks.flatMap((task) => (task.resultImages ?? []).map((path, index) => ({ task, path, index })))

  return <main className="content-page">
    <div className="content-page-head"><div><Link href="/" className="auth-back"><ArrowLeft size={16} />返回首页</Link><h1>资产库</h1><p>查看生成图片与任务记录。</p></div><Link className="primary-action" href="/workbench?mode=general">新建任务</Link></div>
    <div className="library-content">
      <nav className="library-views" aria-label="资产库视图">
        <Link href="/assets" aria-current={view === 'images' ? 'page' : undefined}><ImageIcon size={16} />生成图片</Link>
        <Link href="/assets?view=tasks" aria-current={view === 'tasks' ? 'page' : undefined}><Clock3 size={16} />按任务查看</Link>
      </nav>
      {error && <p className="auth-notice" role="alert">{error}</p>}
      {view === 'images' ? <>
        {activeTasks.length > 0 && <section className="library-active" aria-label="进行中的任务">
          <h2><Clock3 size={18} />进行中的任务</h2>
          <div className="library-active-list">{activeTasks.map((task) =>
            <Link href={`/tasks/${task.id}`} key={task.id}><span>{taskTitle(task)}</span><strong>{statusLabels[task.status]}</strong></Link>)}</div>
        </section>}
        <section className="asset-list">
          <div className="asset-head"><h2><ImageIcon size={18} />生成图片</h2><span className="field-helper">最近任务生成的图片</span></div>
          {loading ? <p className="empty-state">正在加载…</p> : images.length ? <><div className="asset-grid">{images.slice(0, visibleImages).map((image) =>
            <article key={`${image.task.id}-${image.index}`} className="asset-item generated-asset-item">
              <button className="library-image-preview" type="button" aria-label={`预览${taskTitle(image.task)}第${image.index + 1}张图片`} onClick={(event) => { previewTrigger.current = event.currentTarget; setSelectedImage(image) }}>
                <AuthenticatedImage className="asset-placeholder" path={image.path} alt={`${taskTitle(image.task)} ${image.index + 1}`} />
              </button>
              <strong>{taskTitle(image.task)}</strong>
              <span>{taskLabels[image.task.input.taskType ?? ''] ?? '通用生图'} · {new Date(image.task.createdAt).toLocaleString('zh-CN')}</span>
              <div className="library-image-actions"><Link href={`/tasks/${image.task.id}`}>查看来源任务</Link><button type="button" onClick={() => void downloadProtectedAsset(image.path, `istudio-${image.task.id.slice(0, 8)}-${image.index + 1}.png`).catch(() => setError('下载失败'))}><Download size={15} />下载</button></div>
            </article>)}</div>{images.length > visibleImages && <button className="library-load-more" type="button" onClick={() => setVisibleImages((current) => current + 30)}>加载更多图片</button>}</> : <div className="library-empty"><p className="empty-state">暂无生成图片。完成的任务结果会自动出现在这里。</p>{tasks.length > 0 && <Link href="/assets?view=tasks">查看任务记录</Link>}</div>}
        </section>
      </> : <section className="task-list">
        <div className="asset-head"><h2><Clock3 size={18} />任务记录</h2><span className="field-helper">最近任务</span></div>
        {loading ? <p className="empty-state">正在加载…</p> : tasks.length ? <div className="task-grid">{tasks.map((task) =>
          <Link href={`/tasks/${task.id}`} key={task.id} className="task-item library-task-item">
            <div className="library-task-thumbs">{task.resultImages?.length ? task.resultImages.slice(0, 3).map((path, index) =>
              <AuthenticatedImage key={`${path}-${index}`} path={path} alt={`任务结果 ${index + 1}`} />) : <ImageIcon size={24} aria-hidden="true" />}</div>
            <strong>{taskTitle(task)}</strong>
            <span>{taskLabels[task.input.taskType ?? ''] ?? '通用生图'} · {new Date(task.createdAt).toLocaleString('zh-CN')}</span>
            <span className={`library-task-status${activeStatuses.has(task.status) ? ' active' : ''}`}>{statusLabels[task.status] ?? task.status}{task.status === 'failed' ? ' · 查看原因与重试' : ''}{task.status === 'succeeded' ? ` · ${task.resultImages?.length ?? 0} 张` : ''}</span>
          </Link>)}</div> : <div className="library-empty"><p className="empty-state">暂无任务，先创建第一张图片。</p><Link href="/workbench?mode=general">开始创作</Link></div>}
      </section>}
    </div>
    {selectedImage && <div className="library-lightbox" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview() }}>
      <div className="library-lightbox-content" role="dialog" aria-modal="true" aria-label="生成图片预览">
        <button type="button" aria-label="关闭预览" title="关闭" autoFocus onClick={closePreview}><X size={20} /></button>
        <AuthenticatedImage key={selectedImage.path} path={selectedImage.path} alt={`${taskTitle(selectedImage.task)} ${selectedImage.index + 1}`} />
        <div><span>{taskTitle(selectedImage.task)}</span><Link href={`/tasks/${selectedImage.task.id}`}>查看来源任务</Link><button type="button" onClick={() => void downloadProtectedAsset(selectedImage.path, `istudio-${selectedImage.task.id.slice(0, 8)}-${selectedImage.index + 1}.png`).catch(() => setError('下载失败'))}><Download size={15} />下载</button></div>
      </div>
    </div>}
  </main>
}
