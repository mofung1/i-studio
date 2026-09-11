'use client'

import { ArrowLeft, Clock3, Image as ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface TaskSummary {
  id: string
  status: string
  createdAt: string
  input: { mode?: string; taskType?: string; prompt?: string; productName?: string }
}

const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '处理中',
  waiting_provider: '等待 AI 服务',
  succeeded: '已完成',
  failed: '生成失败',
}

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/login')
      return
    }
    fetch(`${apiBaseUrl}/v1/generation/tasks`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (response.status === 401) router.replace('/login')
        if (!response.ok) throw new Error('任务加载失败')
        return response.json()
      })
      .then((data: { tasks?: TaskSummary[] }) => setTasks(data.tasks ?? []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '任务加载失败'))
  }, [router])

  return <main className="projects-page">
    <div className="projects-head"><div><Link href="/" className="auth-back"><ArrowLeft size={16} />返回首页</Link><h1>生成任务</h1><p>查看历史任务、处理状态和生成结果。</p></div><Link className="upload-button" href="/workbench?mode=general">开始创作</Link></div>
    {error && <p className="auth-notice">{error}</p>}
    <section className="project-list"><h2><Clock3 size={18} />最近任务</h2><div className="project-grid">{tasks.map((task) => <Link href={`/tasks/${task.id}`} key={task.id} className="project-item"><strong><ImageIcon size={16} />{task.input.productName ?? task.input.prompt?.slice(0, 24) ?? (task.input.mode === 'commerce' ? '电商图片' : '通用生图')}</strong><span>{statusLabels[task.status] ?? task.status} · {new Date(task.createdAt).toLocaleString()}</span></Link>)}{tasks.length === 0 && <p className="empty-state">暂无任务，先创建第一张图片。</p>}</div></section>
  </main>
}
