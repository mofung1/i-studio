'use client'

import { ArrowLeft, Download, RefreshCw, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { FailureNotice } from '@/components/workbench/failure-notice'
import { ImageLightbox } from '@/components/workbench/image-lightbox'
import { moduleLabel } from '@/components/workbench/shared'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'

interface GenerationTask {
  status: string
  createdAt: string
  input: Record<string, unknown>
  resultImages?: string[]
  resultModules?: string[]
  errorMessage?: string
}

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'expired'])
const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '处理中',
  waiting_provider: '等待 AI 服务',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已过期',
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [task, setTask] = useState<GenerationTask | null>(null)
  const [error, setError] = useState('')
  const [isRetrying, setIsRetrying] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  useEffect(() => {
    let timer = 0
    let cancelled = false
    const load = async () => {
      const token = getAccessToken()
      if (!token) {
        router.replace('/login')
        return
      }
      try {
        const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.status === 401) {
          router.replace('/login')
          return
        }
        if (!response.ok) throw new Error(await readApiError(response, '任务不存在或无权访问'))
        const data = await response.json() as { task: GenerationTask }
        if (cancelled) return
        setTask(data.task)
        setError('')
        if (!terminalStatuses.has(data.task.status)) timer = window.setTimeout(load, 5000)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败')
      }
    }
    void load()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [id, router])

  async function retryTask() {
    setIsRetrying(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!response.ok) throw new Error(await readApiError(response, '任务重试失败'))
      const data = await response.json() as { task: { id: string } }
      router.replace(`/tasks/${data.task.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '任务重试失败')
    } finally {
      setIsRetrying(false)
    }
  }

  return <main className="task-detail-page">
    <Link href="/assets?view=tasks" className="auth-back"><ArrowLeft size={16} />返回资产库</Link>
    <div className="task-detail-card">
      <h1>任务详情</h1>
      {error ? <p className="auth-notice">{error}</p> : task ? <>
        <div className="task-status"><strong>{statusLabels[task.status] ?? task.status}</strong><span>{new Date(task.createdAt).toLocaleString()}</span></div>
        {task.errorMessage && task.status === 'failed' && <FailureNotice message={task.errorMessage} />}
        <section className="task-results">
          <h2>生成结果</h2>
          {task.resultImages?.length ? <div className="result-grid">{task.resultImages.map((path, index) => { const label = moduleLabel(String(task.input.taskType ?? ''), task.resultModules?.[index] ?? ''); return <article key={path}><button type="button" className="result-open" aria-label={`放大查看第 ${index + 1} 张`} title="点击放大查看" onClick={() => setPreviewIndex(index)}><AuthenticatedImage path={path} alt={`生成结果 ${index + 1}`} /></button>{label && <span className="module-badge">{label}</span>}<button type="button" onClick={() => void downloadProtectedAsset(path, `istudio-${id.slice(0, 8)}-${index + 1}.png`)}><Download size={15} />下载</button></article> })}</div> : task.status === 'failed' ? <div className="empty-state">本次任务没有产出图片，失败原因见上方提示。</div> : <div className="empty-state">生成完成后，图片将在这里显示。</div>}
        </section>
        <details><summary>查看生成参数</summary><pre>{JSON.stringify(task.input, null, 2)}</pre></details>
        {task.status === 'failed' && <button className="task-retry-button" type="button" disabled={isRetrying} onClick={() => void retryTask()}><RotateCcw size={16} />{isRetrying ? '正在重试…' : '使用原参数重新生成'}</button>}
        {!terminalStatuses.has(task.status) && <p className="integration-note"><RefreshCw size={16} />任务处理中，页面每 5 秒自动更新。</p>}
      </> : <p>加载中...</p>}
    </div>
    {task?.resultImages?.length && previewIndex !== null && task.resultImages[previewIndex] ? (
      <ImageLightbox
        path={task.resultImages[previewIndex]}
        alt={`生成结果 ${previewIndex + 1}`}
        filename={`istudio-${id.slice(0, 8)}-${previewIndex + 1}`}
        hasPrev={previewIndex > 0}
        hasNext={previewIndex < task.resultImages.length - 1}
        onPrev={() => setPreviewIndex((current) => Math.max(0, (current ?? 1) - 1))}
        onNext={() => setPreviewIndex((current) => Math.min(task.resultImages!.length - 1, (current ?? -1) + 1))}
        onClose={() => setPreviewIndex(null)}
      />
    ) : null}
  </main>
}
