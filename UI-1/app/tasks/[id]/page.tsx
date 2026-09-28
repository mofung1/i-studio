'use client'

import { AlertCircle, ArrowLeft, Download, RefreshCw, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { RegMark } from '@/components/brand'
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
  processing: '正在生成',
  waiting_provider: '等待 AI 服务',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
  expired: '已过期',
}

function statusKind(status: string) {
  if (!terminalStatuses.has(status)) return 'running'
  if (status === 'succeeded') return 'done'
  if (status === 'failed') return 'failed'
  return 'idle'
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [task, setTask] = useState<GenerationTask | null>(null)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)

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
        const data = (await response.json()) as { task: GenerationTask }
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
    setRetrying(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/v1/generation/tasks/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!response.ok) throw new Error(await readApiError(response, '任务重试失败'))
      const data = (await response.json()) as { task: { id: string } }
      router.replace(`/tasks/${data.task.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '任务重试失败')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <AppShell
      bar={
        <header className="job-bar">
          <div className="job-bar-left">
            <Link className="btn btn-quiet" href="/assets?view=tasks">
              <ArrowLeft size={15} aria-hidden="true" />
              任务记录
            </Link>
            <div className="job-slug">
              <span>任务 {id.slice(0, 8)}</span>
              <strong>{task ? (statusLabels[task.status] ?? task.status) : '读取中'}</strong>
            </div>
          </div>
          <div />
          <div className="job-bar-right">
            {task && (
              <span className="status-pill" data-state={statusKind(task.status)}>
                <i aria-hidden="true" />
                {statusLabels[task.status] ?? task.status}
              </span>
            )}
          </div>
        </header>
      }
    >
      <div className="page">
        <div className="page-inner">
          {error && (
            <p className="notice notice-error" role="alert" style={{ marginBottom: 18 }}>
              {error}
            </p>
          )}

          {!task ? (
            <div className="detail-card">
              <div className="skeleton" style={{ height: 26, width: 220 }} />
              <div className="skeleton" style={{ height: 60 }} />
              <div className="skeleton" style={{ height: 280 }} />
            </div>
          ) : (
            <div className="detail-card">
              <div className="detail-top">
                <div>
                  <span className="spec-kicker">generation / {String(task.input.taskType ?? 'general')}</span>
                  <h1>{statusLabels[task.status] ?? task.status}</h1>
                </div>
                <span className="result-head-meta">{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
              </div>

              {task.errorMessage && task.status === 'failed' && (
                <p className="slip" role="alert">
                  <AlertCircle size={14} aria-hidden="true" />
                  <span>
                    <strong>失败原因</strong>
                    {task.errorMessage}
                  </span>
                </p>
              )}

              <div className="section-rule" style={{ margin: 0 }}>
                <h2>生成结果</h2>
                <span>{task.resultImages?.length ?? 0} 张</span>
              </div>

              {task.resultImages?.length ? (
                <div className="result-grid" style={{ transform: 'none' }}>
                  {task.resultImages.map((path, index) => {
                    const label = moduleLabel(String(task.input.taskType ?? ''), task.resultModules?.[index] ?? '')
                    return (
                      <figure className="result-cell" key={path}>
                        <AuthenticatedImage path={path} alt={`生成结果第 ${index + 1} 张`} />
                        <figcaption className="cell-flags">
                          <span className="flag flag-ai">AI 生成</span>
                          {label && <span className="flag flag-module">{label}</span>}
                        </figcaption>
                        <div className="cell-tools" style={{ opacity: 1 }}>
                          <button
                            type="button"
                            title="下载"
                            aria-label={`下载第 ${index + 1} 张`}
                            onClick={() => void downloadProtectedAsset(path, `istudio-${id.slice(0, 8)}-${index + 1}.png`)}
                          >
                            <Download size={15} />
                          </button>
                        </div>
                      </figure>
                    )
                  })}
                </div>
              ) : (
                <div className="blank">
                  <RegMark className="blank-mark" />
                  <strong>{task.status === 'failed' ? '这次没有出图' : '还在处理中'}</strong>
                  <p>
                    {task.status === 'failed'
                      ? task.errorMessage || '供应商没有返回错误详情，可以按原参数重试，或调整参数后重新提交。'
                      : '生成完成后，图片会自动出现在这里，页面每 5 秒刷新一次。'}
                  </p>
                </div>
              )}

              <details className="detail-params">
                <summary>查看这次提交的完整参数</summary>
                <pre>{JSON.stringify(task.input, null, 2)}</pre>
              </details>

              <div className="page-head-actions">
                {task.status === 'failed' && (
                  <button className="btn btn-primary" type="button" disabled={retrying} onClick={() => void retryTask()}>
                    <RotateCcw size={15} aria-hidden="true" />
                    {retrying ? '正在重试…' : '按原参数重新生成'}
                  </button>
                )}
                <Link className="btn btn-outline" href="/">
                  回到工作台
                </Link>
                {!terminalStatuses.has(task.status) && (
                  <span className="frame-note">
                    <RefreshCw size={13} aria-hidden="true" />
                    正在自动刷新
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
