'use client'

import { ArrowLeft, Download, Image as ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'

interface GeneratedTask {
  id: string
  status: string
  createdAt: string
  resultImages?: string[]
  input: { productName?: string; prompt?: string; mode?: string; taskType?: string }
}

const taskLabels: Record<string, string> = {
  'white-background': '白底精修',
  scene: '商品场景图',
  'selling-point': '卖点主图',
  'detail-page': '详情页单页',
}

export default function AssetsPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<GeneratedTask[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/login')
      return
    }
    fetch(`${apiBaseUrl}/v1/generation/tasks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/login')
          return null
        }
        if (!response.ok) throw new Error(await readApiError(response, '资产加载失败'))
        return response.json() as Promise<{ tasks?: GeneratedTask[] }>
      })
      .then((data) => { if (data) setTasks(data.tasks ?? []) })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '资产加载失败'))
  }, [router])

  const assets = tasks.flatMap((task) => (task.resultImages ?? []).map((path, index) => ({
    task,
    path,
    index,
  })))

  return <main className="content-page">
    <div className="content-page-head"><div><Link href="/" className="auth-back"><ArrowLeft size={16} />返回首页</Link><h1>资产库</h1><p>集中查看和下载已生成的图片。</p></div><Link className="primary-action" href="/workbench?mode=general">新建任务</Link></div>
    {error && <p className="auth-notice" role="alert">{error}</p>}
    <section className="asset-list"><div className="asset-head"><h2><ImageIcon size={18} />生成图片</h2><span className="field-helper">图片由生图任务自动归档</span></div><div className="asset-grid">{assets.map(({ task, path, index }) => <article key={`${task.id}-${path}`} className="asset-item generated-asset-item"><AuthenticatedImage className="asset-placeholder" path={path} alt={`${task.input.productName ?? '生成图片'} ${index + 1}`} /><strong>{task.input.productName ?? task.input.prompt?.slice(0, 24) ?? '生成图片'}</strong><span>{taskLabels[task.input.taskType ?? ''] ?? '通用生图'} · {new Date(task.createdAt).toLocaleString('zh-CN')}</span><button type="button" onClick={() => void downloadProtectedAsset(path, `istudio-${task.id.slice(0, 8)}-${index + 1}.png`).catch(() => setError('下载失败'))}><Download size={15} />下载</button></article>)}{assets.length === 0 && <p className="empty-state">暂无生成图片，完成一次生图后会自动出现在这里。</p>}</div></section>
  </main>
}
