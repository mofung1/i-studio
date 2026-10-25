'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { apiBaseUrl, getAccessToken } from '@/lib/api'
import { libraryRequest } from '@/lib/library'
import { formatCredits, refreshAccount } from '@/lib/credits'
import {
  type InspirationSubmission,
  type SubmissionDetail,
  type SubmissionPage,
  type SubmissionSettings,
  submissionStatuses,
  submissionStatus,
} from '@/lib/inspiration-submissions'
import { AccountAccess } from './account-access'
import { useAccount } from './account-provider'
import { LibraryDialog, LibrarySelect } from './library-controls'
import { ConfirmDialog } from './confirm-dialog'
import { InspirationSubmissionCover } from './inspiration-submission-cover'
import { SubmissionHistory } from './inspiration-submission-history'
import { InspirationSubmissionEditor, type SubmissionSeed } from './inspiration-submission-editor'
import { PersonalPromptShare } from './personal-prompt-share'

export function MyInspirationSubmissions() {
  const { account, loading } = useAccount()
  if (loading)
    return (
      <p className="library-count" role="status">
        正在确认登录状态…
      </p>
    )
  if (!account.authenticated)
    return (
      <AccountAccess
        title="登录后分享提示词"
        description="投稿经管理员审核后公开，未通过内容仅本人和管理员可见。"
      />
    )
  return <SubmissionList key={account.user?.id} creditName={account.creditName} />
}

function SubmissionList({ creditName }: { creditName: string }) {
  const [data, setData] = useState<SubmissionPage | null>(null)
  const [settings, setSettings] = useState<SubmissionSettings | null>(null)
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<InspirationSubmission | 'new' | null>(null)
  const [seed, setSeed] = useState<SubmissionSeed>()
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [withdrawing, setWithdrawing] = useState<InspirationSubmission | null>(null)
  const active = useRef(true)
  const intent = useRef<{ from: string | null; create: boolean } | null>(null)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const token = getAccessToken()
    setLoading(true)
    setError('')
    Promise.all([
      libraryRequest<SubmissionPage>(
        `personal/inspiration-submissions?page=${page}&status=${status}`,
        { signal: controller.signal },
      ),
      fetch(`${apiBaseUrl}/v1/inspiration/submission-settings`, {
        signal: controller.signal,
        cache: 'no-store',
      }).then(async (response) => {
        if (!response.ok) throw new Error('投稿设置加载失败')
        return response.json() as Promise<{ settings: SubmissionSettings }>
      }),
    ])
      .then(([items, config]) => {
        if (!controller.signal.aborted && token === getAccessToken()) {
          setData(items)
          setSettings(config.settings)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && token === getAccessToken()) setError(reason.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, status, revision])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    intent.current ??= { from: params.get('from'), create: params.get('new') === '1' }
    const { from, create } = intent.current
    const token = getAccessToken()
    const controller = new AbortController()
    if (from) {
      libraryRequest<{ item: SubmissionSeed }>(`personal/prompts/${encodeURIComponent(from)}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted && token === getAccessToken()) {
            if (!result.item || result.item.id !== from || typeof result.item.prompt !== 'string')
              throw new Error('提示词读取失败，请返回我的提示词重新选择。')
            setSeed(result.item)
            setEditing('new')
            clearIntent()
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason.message)
        })
    } else if (create) {
      setEditing('new')
      clearIntent()
    }
    function clearIntent() {
      params.delete('from')
      params.delete('new')
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + (params.size ? `?${params}` : '') + window.location.hash,
      )
    }
    return () => controller.abort()
  }, [])
  async function inspect(item: InspirationSubmission, more = false) {
    if (busy) return
    const token = getAccessToken()
    setBusy(true)
    setError('')
    try {
      const result = await libraryRequest<SubmissionDetail>(
        `personal/inspiration-submissions/${item.id}${more && detail ? `?beforeVersion=${detail.nextBeforeVersion}` : ''}`,
      )
      if (active.current && token === getAccessToken()) {
        setDetail((previous) =>
          more && previous
            ? { ...result, history: [...previous.history, ...result.history] }
            : result,
        )
        refreshAccount()
      }
    } catch (reason) {
      if (active.current && token === getAccessToken())
        setError(reason instanceof Error ? reason.message : '加载失败')
    } finally {
      if (active.current) setBusy(false)
    }
  }
  async function withdraw() {
    if (!withdrawing || busy) return
    const token = getAccessToken()
    setBusy(true)
    setError('')
    try {
      await libraryRequest(`personal/inspiration-submissions/${withdrawing.id}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ version: withdrawing.version }),
      })
      if (active.current && token === getAccessToken()) {
        setWithdrawing(null)
        setRevision((value) => value + 1)
        setNotice('已撤回分享，投稿和奖励记录保留')
      }
    } catch (reason) {
      if (active.current && token === getAccessToken())
        setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      if (active.current) setBusy(false)
    }
  }
  return (
    <main className="personal-library submission-library">
      <div className="submission-heading">
        <Link className="studio-secondary" href="/inspire">
          返回发现灵感
        </Link>
        <button
          type="button"
          className="studio-primary"
          disabled={!settings?.enabled}
          onClick={() => {
            setSeed(undefined)
            setEditing('new')
          }}
        >
          分享提示词
        </button>
      </div>
      <div className="submission-toolbar">
        <LibrarySelect
          label="筛选投稿状态"
          value={status}
          options={submissionStatuses}
          onChange={(value) => {
            setPage(1)
            setStatus(value)
          }}
        />
        <button
          type="button"
          className="studio-secondary"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          刷新投稿
        </button>
        <span className="library-count">{data?.total ?? 0} 条投稿</span>
      </div>
      {settings && (
        <p className="library-count">
          {settings.enabled
            ? `每天最多提交 ${settings.dailyLimit} 次，修改重提计入次数。`
            : '投稿暂未开放，已有投稿仍可查看和撤回。'}
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
          <button
            type="button"
            className="library-command"
            onClick={() => setRevision((value) => value + 1)}
          >
            重试
          </button>
        </p>
      )}
      {notice && (
        <p className="library-feedback" role="status">
          {notice}
        </p>
      )}
      {loading && <p role="status">正在加载投稿…</p>}
      {!loading && !data?.submissions.length && !error && (
        <div className="library-empty-state">
          <strong>{status === 'all' ? '还没有投稿' : '没有这个状态的投稿'}</strong>
          <p>分享一份提示词和效果封面，通过审核后会出现在发现灵感中。</p>
        </div>
      )}
      <div className="submission-grid">
        {data?.submissions.map((item) => (
          <article className="submission-card" key={item.id}>
            <InspirationSubmissionCover path={item.coverPath} title={item.title} />
            <div className="submission-card-content">
              <span className="submission-status">{submissionStatus(item)}</span>
              <small>
                {item.category} · 版本 {item.version}
              </small>
              <h2>{item.title}</h2>
              <p className="submission-excerpt">{item.prompt}</p>
              {item.reviewReason && (
                <p className="submission-review-reason">审核说明：{item.reviewReason}</p>
              )}
              {item.status !== 'approved' && item.published && (
                <p>已通过的版本 {item.publishedVersion} 仍在公开展示。</p>
              )}
              {item.rewardMinor > 0 && (
                <p>
                  已获奖励 {formatCredits(item.rewardMinor)} {creditName}
                </p>
              )}
              <div className="submission-actions">
                <button
                  type="button"
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() => void inspect(item)}
                >
                  查看记录
                </button>
                {item.status !== 'pending' && settings?.enabled && (
                  <button
                    type="button"
                    className="studio-secondary"
                    onClick={() => setEditing(item)}
                  >
                    修改重提
                  </button>
                )}
                {(item.status === 'pending' || item.published) && (
                  <button
                    type="button"
                    className="library-command"
                    disabled={busy}
                    onClick={() => setWithdrawing(item)}
                  >
                    撤回分享
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {data && data.totalPages > 1 && (
        <nav className="submission-pagination" aria-label="投稿分页">
          <button
            type="button"
            className="studio-secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </button>
          <span>
            {data.page} / {data.totalPages}
          </span>
          <button
            type="button"
            className="studio-secondary"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </nav>
      )}
      {editing === 'new' && seed && settings?.enabled && (
        <PersonalPromptShare
          source={seed}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setPage(1)
            setStatus('all')
            setRevision((value) => value + 1)
            setNotice('已提交审核，通过后会在发现灵感中公开')
          }}
        />
      )}
      {editing && !(editing === 'new' && seed) && settings?.enabled && (
        <InspirationSubmissionEditor
          item={editing === 'new' ? undefined : editing}
          seed={editing === 'new' ? seed : undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setPage(1)
            setStatus('all')
            setRevision((value) => value + 1)
            setNotice('已提交审核，通过后会在发现灵感中公开')
          }}
        />
      )}
      {detail && (
        <LibraryDialog title={detail.submission.title} onClose={() => setDetail(null)}>
          <p>
            {submissionStatus(detail.submission)} · {detail.submission.category}
          </p>
          {detail.submission.rewardMinor > 0 && (
            <p>
              累计奖励：{formatCredits(detail.submission.rewardMinor)} {creditName}
            </p>
          )}
          <SubmissionHistory detail={detail} onMore={() => void inspect(detail.submission, true)} />
        </LibraryDialog>
      )}
      {withdrawing && (
        <ConfirmDialog
          title="撤回分享"
          description={`撤回“${withdrawing.title}”后，其他用户将无法继续浏览这条投稿。`}
          detail="已发放的积分和审核记录保留。"
          confirmLabel="撤回分享"
          busy={busy}
          error={error}
          onCancel={() => {
            if (!busy) setWithdrawing(null)
          }}
          onConfirm={() => void withdraw()}
        />
      )}
    </main>
  )
}
