'use client'
import { useTransientMessage } from '@/hooks/use-transient-message'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAdminAccount } from '@/components/account-provider'
import { adminRequest, adminFetch } from '@/lib/admin'
import { getAdminAccessToken } from '@/lib/api'
import { formatCredits } from '@/lib/credits'
import { formatLibraryDate } from '@/lib/library'
import {
  type InspirationSubmission,
  type SubmissionPage,
  type SubmissionDetail,
  type SubmissionSettings,
  submissionStatuses,
  submissionStatus,
  parseSubmissionReward,
} from '@/lib/inspiration-submissions'
import { LibraryDialog, LibrarySelect } from '@/components/library-controls'
import { DialogActions } from '@/components/dialog-actions'
import { InspirationSubmissionCover } from '@/components/inspiration-submission-cover'
import { SubmissionHistory } from '@/components/inspiration-submission-history'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { AdminPageHeader } from './page-header'
import { AdminDataTable, type AdminColumn } from './data-table'
import { AdminPagination } from './pagination'
import { AdminStatusBadge } from './status-badge'

async function loadAdminCover(path: string, signal: AbortSignal) {
  if (!path.startsWith('/v1/admin/inspiration-submissions/')) throw new Error('封面路径无效')
  const token = getAdminAccessToken()
  const response = await adminFetch(path.slice('/v1/admin/'.length), { signal })
  const blob = await response.blob()
  if (token !== getAdminAccessToken()) throw new Error('管理员账号已切换')
  return blob
}
function adminCover(item: InspirationSubmission) {
  return (
    <InspirationSubmissionCover path={item.coverPath} title={item.title} load={loadAdminCover} />
  )
}
function ReviewPanel({
  detail,
  categories,
  creditName,
  onChanged,
  onMore,
  onClose,
}: {
  detail: SubmissionDetail
  categories: Array<{ id: string; category: string }>
  creditName: string
  onChanged: (result?: SubmissionDetail) => void
  onMore: () => void
  onClose: () => void
}) {
  const item = detail.submission
  const [categoryId, setCategoryId] = useState(item.categoryId)
  const [reason, setReason] = useState('')
  const [grant, setGrant] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const alive = useRef(true)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function decide(decision: 'approve' | 'reject' | 'unpublish') {
    if (pending.current) return
    const rewardMinor = grant ? parseSubmissionReward(amount) : 0
    const problem =
      decision !== 'approve' && !reason.trim()
        ? '请填写退回或下架原因'
        : decision === 'approve' && !categoryId
          ? '请选择发布分类'
          : decision === 'approve' && grant && rewardMinor === null
            ? '奖励数量需为 1–1000000 的整数'
            : ''
    if (problem) {
      setError(problem)
      errorRef.current?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    const token = getAdminAccessToken()
    try {
      const result = await adminRequest<SubmissionDetail>(
        `inspiration-submissions/${item.id}/${decision === 'unpublish' ? 'unpublish' : 'review'}`,
        'POST',
        decision === 'unpublish'
          ? { version: item.version, reason }
          : {
              version: item.version,
              decision,
              categoryId,
              reason,
              grantReward: decision === 'approve' && grant,
              rewardMinor: decision === 'approve' ? rewardMinor : 0,
            },
      )
      if (alive.current && token === getAdminAccessToken())
        onChanged(decision === 'unpublish' ? undefined : result)
    } catch (failure) {
      if (alive.current && token === getAdminAccessToken()) {
        setError(failure instanceof Error ? failure.message : '审核失败，请重试')
        errorRef.current?.focus()
      }
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <LibraryDialog
      title={`审核投稿：${item.title}`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <DialogActions>
          {item.published && (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void decide('unpublish')}
            >
              下架公开内容
            </Button>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            关闭
          </Button>
          {item.status === 'pending' && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void decide('reject')}
              >
                退回修改
              </Button>
              <Button type="button" disabled={busy} onClick={() => void decide('approve')}>
                {busy
                  ? '正在处理…'
                  : grant
                    ? `通过并奖励${amount ? ` ${amount} ${creditName}` : ''}`
                    : '通过并发布'}
              </Button>
            </>
          )}
        </DialogActions>
      }
    >
      <div className="submission-review-panel">
        <p>
          {item.username} · {submissionStatus(item)} · 版本 {item.version}
        </p>
        <InspirationSubmissionCover
          path={item.coverPath}
          title={item.title}
          load={loadAdminCover}
        />
        <p className="submission-full-prompt">{item.prompt}</p>
        {item.requiresReference && <p>需要参考图</p>}
        {item.instructions && (
          <p className="submission-full-prompt">使用说明：{item.instructions}</p>
        )}
        {item.published && item.status !== 'approved' && (
          <p>版本 {item.publishedVersion} 仍在公开展示。</p>
        )}
        {item.reviewReason && <p>审核说明：{item.reviewReason}</p>}
        {item.rewardMinor > 0 && (
          <p>
            本条投稿已奖励 {formatCredits(item.rewardMinor)} {creditName}，后续版本不重复奖励。
          </p>
        )}
        <fieldset disabled={busy} className="submission-review-fields">
          <legend className="sr-only">审核操作</legend>
          <FieldGroup>
            {item.status === 'pending' && (
              <Field>
                <FieldLabel>发布分类</FieldLabel>
                <LibrarySelect
                  label="审核发布分类"
                  value={categoryId}
                  onChange={setCategoryId}
                  options={categories.map((category) => [category.id, category.category])}
                />
              </Field>
            )}
            {(item.status === 'pending' || item.published) && (
              <Field>
                <FieldLabel htmlFor="submission-review-reason">审核说明</FieldLabel>
                <textarea
                  className="submission-review-textarea"
                  id="submission-review-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="通过时选填，退回或下架时必填"
                />
              </Field>
            )}
            {item.status === 'pending' && (
              <Field>
                <label className="submission-check">
                  <input
                    type="checkbox"
                    checked={grant}
                    disabled={item.rewardMinor > 0}
                    onChange={(event) => setGrant(event.target.checked)}
                  />
                  审核通过时奖励积分
                </label>
                {grant && (
                  <>
                    <FieldLabel htmlFor="submission-reward">奖励数量（{creditName}）</FieldLabel>
                    <Input
                      id="submission-reward"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1000000}
                      step={1}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <small>通过后立即到账，本条投稿只奖励一次。</small>
                  </>
                )}
              </Field>
            )}
          </FieldGroup>
        </fieldset>
        <p
          className="settings-error"
          role={error ? 'alert' : undefined}
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
        <SubmissionHistory detail={detail} renderCover={adminCover} onMore={onMore} />
      </div>
    </LibraryDialog>
  )
}

export function AdminInspirationSubmissions() {
  const { account } = useAdminAccount()
  return <AdminSubmissionContent key={account.user?.id} creditName={account.creditName} />
}

function AdminSubmissionContent({ creditName }: { creditName: string }) {
  const [data, setData] = useState<SubmissionPage | null>(null)
  const [settings, setSettings] = useState<SubmissionSettings | null>(null)
  const savedSettings = useRef<SubmissionSettings | null>(null)
  const rulesDirty = useRef(false)
  rulesDirty.current =
    settings !== null && JSON.stringify(settings) !== JSON.stringify(savedSettings.current)
  const [categories, setCategories] = useState<Array<{ id: string; category: string }>>([])
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useTransientMessage()
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const alive = useRef(true)
  const detailPending = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const token = getAdminAccessToken()
    setLoading(true)
    setError('')
    Promise.all([
      adminRequest<SubmissionPage>(
        `inspiration-submissions?page=${page}&status=${status}&q=${encodeURIComponent(query)}`,
        'GET',
        undefined,
        controller.signal,
      ),
      adminRequest<{ settings: SubmissionSettings }>(
        'inspiration-submission-settings',
        'GET',
        undefined,
        controller.signal,
      ),
      adminRequest<{ categories: Array<{ id: string; category: string }> }>(
        'inspiration/categories?includeDisabled=true',
        'GET',
        undefined,
        controller.signal,
      ),
    ])
      .then(([items, config, classification]) => {
        if (!controller.signal.aborted && token === getAdminAccessToken()) {
          setData(items)
          if (!rulesDirty.current) {
            savedSettings.current = config.settings
            setSettings(config.settings)
          }
          setCategories(classification.categories)
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted && token === getAdminAccessToken()) setError(failure.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, status, query, revision])
  async function inspect(id: string, more = false) {
    if (detailPending.current) return
    detailPending.current = true
    setBusy(true)
    setError('')
    const token = getAdminAccessToken()
    try {
      const result = await adminRequest<SubmissionDetail>(
        `inspiration-submissions/${encodeURIComponent(id)}${more && detail ? `?beforeVersion=${detail.nextBeforeVersion}` : ''}`,
      )
      if (alive.current && token === getAdminAccessToken())
        setDetail((previous) =>
          more && previous
            ? { ...result, history: [...previous.history, ...result.history] }
            : result,
        )
    } catch (failure) {
      if (alive.current && token === getAdminAccessToken())
        setError(failure instanceof Error ? failure.message : '读取失败')
    } finally {
      detailPending.current = false
      if (alive.current) setBusy(false)
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) void inspect(id)
    // The linked submission is read once; later paging must not reopen its dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function saveSettings() {
    if (!settings || busy) return
    setBusy(true)
    setError('')
    const token = getAdminAccessToken()
    try {
      const result = await adminRequest<{ settings: SubmissionSettings }>(
        'inspiration-submission-settings',
        'PUT',
        settings,
      )
      if (alive.current && token === getAdminAccessToken()) {
        savedSettings.current = result.settings
        setSettings(result.settings)
        setNotice('投稿设置已保存')
      }
    } catch (failure) {
      if (alive.current && token === getAdminAccessToken())
        setError(failure instanceof Error ? failure.message : '保存失败')
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const columns: AdminColumn<InspirationSubmission>[] = [
    {
      id: 'title',
      header: '提示词',
      size: 260,
      pin: 'left',
      cell: (item) => (
        <div className="admin-cell-heading">
          <strong>{item.title}</strong>
          <span>
            {item.category} · 版本 {item.version}
          </span>
        </div>
      ),
    },
    { id: 'username', header: '投稿用户', size: 150, cell: (item) => item.username ?? '—' },
    {
      id: 'status',
      header: '审核状态',
      size: 160,
      cell: (item) => (
        <AdminStatusBadge
          tone={
            item.status === 'pending'
              ? 'warning'
              : item.status === 'approved' && item.published
                ? 'success'
                : 'neutral'
          }
        >
          {submissionStatus(item)}
        </AdminStatusBadge>
      ),
    },
    {
      id: 'reward',
      header: '已发奖励',
      size: 140,
      align: 'right',
      cell: (item) => (
        <span className="admin-cell-number">
          {formatCredits(item.rewardMinor)} {creditName}
        </span>
      ),
    },
    {
      id: 'createdAt',
      header: '提交时间',
      size: 180,
      cell: (item) => formatLibraryDate(item.createdAt),
    },
    {
      id: 'actions',
      header: '操作',
      size: 110,
      pin: 'right',
      cell: (item) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void inspect(item.id)}
        >
          {item.status === 'pending' ? '审核' : '查看记录'}
        </Button>
      ),
    },
  ]
  return (
    <main className="submission-admin admin-list-page">
      <AdminPageHeader title="用户投稿审核" />
      {settings && (
        <details className="submission-rules">
          <summary>
            <strong>投稿开放规则</strong>
            <span>
              {savedSettings.current?.enabled ? '已开放投稿' : '已暂停投稿'} · 每人每天{' '}
              {savedSettings.current?.dailyLimit} 次{rulesDirty.current && ' · 有未保存更改'}
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <form
            className="ops-card submission-settings"
            aria-label="投稿设置"
            onSubmit={(event) => {
              event.preventDefault()
              void saveSettings()
            }}
          >
            <FieldGroup className="submission-settings-fields">
              <Field className="submission-setting-toggle">
                <label className="submission-check">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    disabled={busy}
                    onChange={(event) =>
                      setSettings({ ...settings, enabled: event.target.checked })
                    }
                  />
                  开放用户投稿
                </label>
              </Field>
              <Field orientation="horizontal" className="submission-setting-limit">
                <FieldLabel htmlFor="submission-daily-limit">每人每日提交上限</FieldLabel>
                <Input
                  id="submission-daily-limit"
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={settings.dailyLimit}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({ ...settings, dailyLimit: Number(event.target.value) })
                  }
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={busy}>
              保存投稿设置
            </Button>
          </form>
        </details>
      )}
      <form
        className="submission-toolbar"
        aria-label="筛选用户投稿"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setQuery(search.trim())
        }}
      >
        <Input
          aria-label="搜索投稿"
          placeholder="搜索标题、投稿编号或用户名"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <LibrarySelect
          label="筛选审核状态"
          value={status}
          options={submissionStatuses}
          onChange={(value) => {
            setPage(1)
            setStatus(value)
          }}
        />
        <Button type="submit" variant="outline">
          搜索
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          刷新
        </Button>
      </form>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="library-feedback" role="status">
          {notice}
        </p>
      )}
      <AdminDataTable
        title="用户投稿列表"
        columns={columns}
        data={data?.submissions ?? []}
        getRowId={(item) => item.id}
        loading={loading}
        emptyTitle={error ? '投稿读取失败' : '没有匹配的投稿'}
        emptyDescription={
          error
            ? '请刷新后重试，当前筛选条件会保留。'
            : status === 'pending'
              ? '当前没有待审核投稿，可切换状态查看已有记录。'
              : '尝试切换审核状态或搜索其他关键词。'
        }
        scrollKey={`${data?.page}:${status}:${query}`}
      />
      {data && (
        <AdminPagination
          {...data}
          pageSize={20}
          label="投稿"
          loading={loading || busy}
          onPageChange={setPage}
        />
      )}
      {detail && (
        <ReviewPanel
          key={`${detail.submission.id}-${detail.submission.version}`}
          detail={detail}
          categories={categories}
          creditName={creditName}
          onClose={() => setDetail(null)}
          onChanged={(result) => {
            setDetail(result ?? null)
            setRevision((value) => value + 1)
            setNotice(
              result ? '审核已完成，发布与奖励已同步处理' : '已下架，已发奖励和审核记录保留',
            )
          }}
          onMore={() => void inspect(detail.submission.id, true)}
        />
      )}
    </main>
  )
}
