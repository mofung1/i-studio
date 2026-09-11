'use client'

import { ArrowLeft, Download, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'

interface GenerationTask {
  status: string
  createdAt: string
  input: Record<string, unknown>
  resultImages?: string[]
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
    <Link href="/tasks" className="auth-back"><ArrowLeft size={16} />返回任务列表</Link>
    <div className="task-detail-card">
      <span className="eyebrow"><LoaderCircle size={16} />生成任务</span>
      <h1>任务详情</h1>
      {error ? <p className="auth-notice">{error}</p> : task ? <>
        <div className="task-status"><strong>{statusLabels[task.status] ?? task.status}</strong><span>{new Date(task.createdAt).toLocaleString()}</span></div>
        <section className="task-results">
          <h2>生成结果</h2>
          {task.resultImages?.length ? <div className="result-grid">{task.resultImages.map((path, index) => <article key={path}><AuthenticatedImage path={path} alt={`生成结果 ${index + 1}`} /><button type="button" onClick={() => void downloadProtectedAsset(path, `istudio-${id.slice(0, 8)}-${index + 1}.png`)}><Download size={15} />下载</button></article>)}</div> : task.errorMessage ? <div className="empty-state">{task.errorMessage}</div> : task.status === 'failed' ? <div className="empty-state">生成失败，但供应商未返回错误详情。请重试或查看 API 日志。</div> : <div className="empty-state">生成完成后，图片将在这里显示。</div>}
        </section>
        <details><summary>查看生成参数</summary><pre>{JSON.stringify(task.input, null, 2)}</pre></details>
        {task.status === 'failed' && <button className="task-retry-button" type="button" disabled={isRetrying} onClick={() => void retryTask()}><RotateCcw size={16} />{isRetrying ? '正在重试…' : '使用原参数重新生成'}</button>}
        {!terminalStatuses.has(task.status) && <p className="integration-note"><RefreshCw size={16} />任务处理中，页面每 5 秒自动更新。</p>}
      </> : <p>加载中...</p>}
    </div>
  </main>
}
