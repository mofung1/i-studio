'use client'

import { ArrowLeft, Clock3, Image as ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { apiBaseUrl, getAccessToken } from '@/lib/api'

interface TaskSummary {
  id: string
  status: string
  createdAt: string
  input: { mode?: string; taskType?: string; prompt?: string; productName?: string }
  projectId?: string
  projectName?: string
}

const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '处理中',
  waiting_provider: '等待 AI 服务',
  succeeded: '已完成',
  failed: '生成失败',
}

function TasksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId') ?? ''
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/login')
      return
    }
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
    fetch(`${apiBaseUrl}/v1/generation/tasks${query}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (response.status === 401) router.replace('/login')
        if (!response.ok) throw new Error('任务加载失败')
        return response.json()
      })
      .then((data: { tasks?: TaskSummary[] }) => setTasks(data.tasks ?? []))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '任务加载失败'))
  }, [projectId, router])

  return <main className="projects-page">
    <div className="projects-head"><div><Link href={projectId ? '/projects' : '/'} className="auth-back"><ArrowLeft size={16} />{projectId ? '返回项目' : '返回首页'}</Link><h1>{projectId ? '项目任务' : '任务中心'}</h1><p>{projectId ? '只查看当前项目创建的生成任务。' : '查看所有项目的生成任务和执行状态。'}</p></div><Link className="upload-button" href={projectId ? `/workbench?mode=commerce&task=white-background&projectId=${projectId}` : '/workbench?mode=general'}>新建任务</Link></div>
    {error && <p className="auth-notice">{error}</p>}
    <section className="project-list"><h2><Clock3 size={18} />{projectId ? '项目任务' : '最近任务'}</h2><div className="project-grid">{tasks.map((task) => <Link href={`/tasks/${task.id}`} key={task.id} className="project-item"><strong><ImageIcon size={16} />{task.input.productName ?? task.input.prompt?.slice(0, 24) ?? (task.input.mode === 'commerce' ? '电商图片' : '通用生图')}</strong><span>{task.projectName ? `项目：${task.projectName} · ` : '未归属项目 · '}{statusLabels[task.status] ?? task.status} · {new Date(task.createdAt).toLocaleString()}</span></Link>)}{tasks.length === 0 && <p className="empty-state">暂无任务，先创建第一张图片。</p>}</div></section>
  </main>
}

export default function TasksPage() {
  return <Suspense fallback={<main className="projects-page" aria-label="任务加载中" />}><TasksContent /></Suspense>
}
