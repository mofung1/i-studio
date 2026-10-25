'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAdminAccount } from '@/components/account-provider'
import { getAdminAccessToken } from '@/lib/api'
import { adminFetch, adminRequest } from '@/lib/admin'
import { type FeedbackDetail, type FeedbackItem, type FeedbackPage } from '@/lib/feedback'
import { formatLibraryDate } from '@/lib/library'
import { LibraryDialog, LibrarySelect } from '@/components/library-controls'
import { InfoDialog } from '@/components/info-dialog'
import { DialogActions } from '@/components/dialog-actions'
import { AdminPageHeader } from './page-header'
import { AdminDataTable, type AdminColumn } from './data-table'
import { AdminPagination } from './pagination'
import { AdminStatusBadge } from './status-badge'
import { Button } from './ui/button'
import { Input } from './ui/input'

function FeedbackAttachment({ path, position }: { path: string; position: number }) {
  const [source, setSource] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const token = getAdminAccessToken()
    let url = ''
    setSource('')
    setError(false)
    adminFetch(path.replace('/v1/admin/', ''), { signal: controller.signal })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted || token !== getAdminAccessToken()) return
        url = URL.createObjectURL(blob)
        setSource(url)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, attempt])
  return (
    <>
      <button
        type="button"
        className="feedback-attachment"
        aria-label={error ? `重试加载第 ${position} 张反馈图片` : `查看第 ${position} 张反馈图片`}
        disabled={!source && !error}
        onClick={() => (error ? setAttempt((n) => n + 1) : setExpanded(true))}
      >
        {source ? (
          <img src={source} alt={`反馈图片 ${position}`} />
        ) : (
          <span>{error ? '加载失败，点击重试' : '正在加载…'}</span>
        )}
      </button>
      {expanded && (
        <InfoDialog title={`反馈图片 ${position}`} onClose={() => setExpanded(false)}>
          <img className="feedback-full-image" src={source} alt={`反馈图片 ${position}`} />
        </InfoDialog>
      )}
    </>
  )
}
function FeedbackPanel({
  detail,
  onClose,
  onUpdated,
}: {
  detail: FeedbackDetail
  onClose: () => void
  onUpdated: (next: FeedbackDetail) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function update() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    const token = getAdminAccessToken()
    try {
      const result = await adminRequest<FeedbackDetail>(
        `feedback/${encodeURIComponent(detail.feedback.id)}`,
        'PATCH',
        {
          status: detail.feedback.status === 'pending' ? 'handled' : 'pending',
        },
      )
      if (alive.current && token === getAdminAccessToken()) onUpdated(result)
    } catch (reason) {
      if (alive.current && token === getAdminAccessToken())
        setError(reason instanceof Error ? reason.message : '更新失败，请重试')
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  const item = detail.feedback
  return (
    <LibraryDialog
      title="反馈详情"
      onClose={() => {
        if (!pending.current) onClose()
      }}
      footer={
        <DialogActions>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            关闭
          </Button>
          <Button disabled={busy} onClick={() => void update()}>
            {busy ? '正在更新…' : item.status === 'pending' ? '标记已处理' : '恢复待处理'}
          </Button>
        </DialogActions>
      }
    >
      <dl className="feedback-meta">
        <div>
          <dt>提交用户</dt>
          <dd>{item.username}</dd>
        </div>
        <div>
          <dt>提交时间</dt>
          <dd>{formatLibraryDate(item.createdAt)}</dd>
        </div>
        <div>
          <dt>来源页面</dt>
          <dd>{item.pagePath}</dd>
        </div>
        <div>
          <dt>处理状态</dt>
          <dd>{item.status === 'pending' ? '待处理' : '已处理'}</dd>
        </div>
        {item.handledAt && (
          <div>
            <dt>处理时间</dt>
            <dd>{formatLibraryDate(item.handledAt)}</dd>
          </div>
        )}
      </dl>
      <p className="feedback-content">{item.content}</p>
      {!!detail.images.length && (
        <div className="feedback-attachments">
          {detail.images.map((image) => (
            <FeedbackAttachment key={image.path} {...image} />
          ))}
        </div>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </LibraryDialog>
  )
}
function FeedbackList() {
  const [data, setData] = useState<FeedbackPage>({
    feedback: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  })
  const [filters, setFilters] = useState({ q: '', status: 'pending', page: 1, pageSize: 20 })
  const [search, setSearch] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<FeedbackDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailAttempt, setDetailAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const token = getAdminAccessToken()
    setLoading(true)
    setError('')
    const query = new URLSearchParams(
      Object.entries(filters).map(([key, value]) => [key, String(value)]),
    )
    adminRequest<FeedbackPage>(`feedback?${query}`, 'GET', undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && token === getAdminAccessToken()) setData(result)
      })
      .catch((reason) => {
        if (!controller.signal.aborted && token === getAdminAccessToken()) setError(reason.message)
      })
      .finally(() => {
        if (!controller.signal.aborted && token === getAdminAccessToken()) setLoading(false)
      })
    return () => controller.abort()
  }, [filters, refresh])
  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    const controller = new AbortController()
    const token = getAdminAccessToken()
    setDetail(null)
    setDetailError('')
    adminRequest<FeedbackDetail>(
      `feedback/${encodeURIComponent(selected)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted && token === getAdminAccessToken()) setDetail(result)
      })
      .catch((reason) => {
        if (!controller.signal.aborted && token === getAdminAccessToken())
          setDetailError(reason.message)
      })
    return () => controller.abort()
  }, [selected, detailAttempt])
  const columns: AdminColumn<FeedbackItem>[] = [
    {
      id: 'content',
      header: '反馈内容',
      size: 360,
      pin: 'left',
      cell: (item) => (
        <p className="admin-feedback-excerpt" title={item.content}>
          {item.content}
        </p>
      ),
    },
    { id: 'username', header: '提交用户', size: 130, cell: (item) => item.username },
    { id: 'images', header: '图片', size: 80, cell: (item) => `${item.imageCount} 张` },
    { id: 'page', header: '来源页面', size: 160, cell: (item) => item.pagePath },
    {
      id: 'status',
      header: '状态',
      size: 110,
      cell: (item) => (
        <AdminStatusBadge tone={item.status === 'handled' ? 'success' : 'warning'}>
          {item.status === 'handled' ? '已处理' : '待处理'}
        </AdminStatusBadge>
      ),
    },
    {
      id: 'created',
      header: '提交时间',
      size: 170,
      cell: (item) => formatLibraryDate(item.createdAt),
    },
    {
      id: 'actions',
      header: '操作',
      size: 100,
      pin: 'right',
      cell: (item) => (
        <Button variant="outline" size="sm" onClick={() => setSelected(item.id)}>
          查看反馈
        </Button>
      ),
    },
  ]
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setFilters({ ...filters, q: search.trim(), page: 1 })
  }
  return (
    <main className="admin-list-page">
      <AdminPageHeader title="意见反馈" />
      <form
        className="feedback-toolbar"
        onSubmit={submitSearch}
        role="search"
        aria-label="搜索与筛选反馈"
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索反馈内容、编号或用户名"
          aria-label="搜索反馈"
        />
        <LibrarySelect
          label="反馈处理状态"
          value={filters.status}
          options={[
            ['all', '全部状态'],
            ['pending', '待处理'],
            ['handled', '已处理'],
          ]}
          onChange={(status) => setFilters({ ...filters, status, page: 1 })}
        />
        <Button type="submit" variant="outline">
          搜索
        </Button>
        <Button type="button" variant="outline" onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw aria-hidden="true" />
          刷新
        </Button>
      </form>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      <AdminDataTable
        title="反馈列表"
        columns={columns}
        data={data.feedback}
        getRowId={(item) => item.id}
        loading={loading}
        emptyTitle={error ? '反馈读取失败' : '暂无匹配的反馈'}
        emptyDescription={error ? '点击刷新后重试。' : '用户提交的反馈会在这里显示。'}
        scrollKey={`${data.page}:${filters.q}:${filters.status}`}
      />
      <AdminPagination
        {...data}
        loading={loading}
        label="反馈"
        onPageChange={(page) => setFilters({ ...filters, page })}
        onPageSizeChange={(pageSize) => setFilters({ ...filters, pageSize, page: 1 })}
      />
      {selected &&
        (detail ? (
          <FeedbackPanel
            key={selected}
            detail={detail}
            onClose={() => setSelected(null)}
            onUpdated={(next) => {
              setDetail(next)
              setRefresh((n) => n + 1)
            }}
          />
        ) : (
          <LibraryDialog
            title="反馈详情"
            onClose={() => setSelected(null)}
            footer={
              <DialogActions>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  关闭
                </Button>
              </DialogActions>
            }
          >
            {detailError ? (
              <>
                <p className="settings-error" role="alert">
                  {detailError}
                </p>
                <Button variant="outline" onClick={() => setDetailAttempt((n) => n + 1)}>
                  重试
                </Button>
              </>
            ) : (
              <p role="status">正在读取反馈…</p>
            )}
          </LibraryDialog>
        ))}
    </main>
  )
}

export function AdminFeedback() {
  const { account } = useAdminAccount()
  return account.authenticated ? <FeedbackList key={account.user?.id} /> : null
}
