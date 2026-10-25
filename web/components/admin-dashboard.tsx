'use client'
import { AdminPageHeader } from './admin/page-header'
import { useActionConfirmation } from './use-action-confirmation'
import { getAdminAccessToken } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import type { AIEndpoint } from '@/lib/ai-settings'
import { parseCredits, refreshAccount } from '@/lib/credits'
import { useAdminAccount } from './account-provider'
import type {
  AdminModel as Model,
  AdminMember as Member,
  AdminOperations as Operations,
  AdminTask as Task,
  AdminAudit as Audit,
  AdminTaskPage,
  AdminUserPage,
  AdminAuditPage,
  AdminModelPage,
} from '@/lib/admin'
import type { AdminSorting } from './admin/data-table'
import { AdminUserTable } from './admin/user-table'
import { adminRequest as request } from '@/lib/admin'
import { AdminOverview } from './admin/overview'
import { AdminMonitoring } from './admin/monitoring'
import { AdminModelList } from './admin/model-list'
import { AdminTaskTable } from './admin/task-table'
import { AdminAuditTable } from './admin/audit-table'
import { AdminOperationsForm } from './admin/operations-form'
import { AdminModelEditor } from './admin/model-editor'
import { AdminBalanceEditor } from './admin/balance-editor'
import { AdminPagination } from './admin/pagination'
import { AdminEditorDialog as InfoDialog } from './admin/editor-dialog'

const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请重试')

export function AdminDashboard({
  view,
}: {
  view: 'overview' | 'models' | 'users' | 'operations' | 'tasks' | 'audit'
}) {
  const { account, refresh: refreshAdmin } = useAdminAccount()
  const { ask, confirmation } = useActionConfirmation(getAdminAccessToken)
  const [models, setModels] = useState<Model[]>([])
  const [endpoints, setEndpoints] = useState<AIEndpoint[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [revision, setRevision] = useState(0)
  const [sorting, setSorting] = useState<AdminSorting>([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  })
  const [audit, setAudit] = useState<Audit[]>([])
  const [overview, setOverview] = useState<Record<string, number>>({})
  const [ops, setOps] = useState<Operations | null>(null)
  const [gift, setGift] = useState('0')
  const [giftBudget, setGiftBudget] = useState('1000')
  const [checkinReward, setCheckinReward] = useState('0')
  const [checkinBudget, setCheckinBudget] = useState('1000')
  const [creditAlert, setCreditAlert] = useState('1000')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState<Model | null>(null)
  const [price, setPrice] = useState('0')
  const [adjusting, setAdjusting] = useState<Member | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [adjustmentKey, setAdjustmentKey] = useState('')
  const loadVersion = useRef(0)
  const editorHost = useRef<HTMLElement>(null)
  const listRegion = useRef<HTMLDivElement>(null)
  const unit = account.creditName
  const isList = ['models', 'users', 'tasks', 'audit'].includes(view)
  useEffect(() => {
    const scroll = listRegion.current?.querySelector('.admin-data-scroll')
    if (scroll) scroll.scrollTop = 0
  }, [pagination.page, pagination.pageSize, query, sorting])
  const load = useCallback(async () => {
    const version = ++loadVersion.current
    const current = () => version === loadVersion.current
    const params = new URLSearchParams(view === 'users' ? { q: query } : {})
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (sorting[0]) {
      params.set('sort', sorting[0].id)
      params.set('order', sorting[0].desc ? 'desc' : 'asc')
    }
    if (view === 'overview') {
      const data = await request<Record<string, number>>('overview')
      if (current()) setOverview(data)
    }
    if (view === 'models') {
      const [catalog, services] = await Promise.all([
        request<AdminModelPage>(`models?${params}`),
        request<{ endpoints: AIEndpoint[] }>('ai-endpoints'),
      ])
      if (current()) {
        setModels(catalog.models)
        setEndpoints(services.endpoints.filter((item) => item.purpose === 'image'))
        setPagination(catalog)
        if (catalog.page !== page) setPage(catalog.page)
      }
    }
    if (view === 'users') {
      const data = await request<AdminUserPage>(`users?${params}`)
      if (current()) {
        setMembers(data.users)
        setPagination(data)
        if (data.page !== page) setPage(data.page)
      }
    }
    if (view === 'operations') {
      const settings = await request<Operations>('settings')
      if (current()) {
        setOps(settings)
        setGift(String(settings.signupGiftMinor / 100))
        setGiftBudget(String((settings.signupGiftDailyBudgetMinor ?? 100000) / 100))
        setCheckinReward(String((settings.checkinRewardMinor ?? 0) / 100))
        setCheckinBudget(String((settings.checkinDailyBudgetMinor ?? 100000) / 100))
        setCreditAlert(String((settings.dailyCreditAlertMinor ?? 100000) / 100))
      }
    }
    if (view === 'tasks') {
      const data = await request<AdminTaskPage>(`tasks?${params}`)
      if (current()) {
        setTasks(data.tasks)
        setPagination(data)
        if (data.page !== page) setPage(data.page)
      }
    }
    if (view === 'audit') {
      const data = await request<AdminAuditPage>(`audit?${params}`)
      if (current()) {
        setAudit(data.audit)
        setPagination(data)
        if (data.page !== page) setPage(data.page)
      }
    }
  }, [view, query, page, pageSize, revision, sorting])
  function changeSorting(next: AdminSorting) {
    setLoading(true)
    setSorting(next)
    setPage(1)
  }
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    const timer = setTimeout(
      () => {
        load()
          .catch((error) => {
            if (current) setError(errorText(error))
          })
          .finally(() => {
            if (current) setLoading(false)
          })
      },
      view === 'users' ? 250 : 0,
    )
    return () => {
      current = false
      loadVersion.current++
      clearTimeout(timer)
    }
  }, [load, view])
  async function refresh() {
    if (loading || busy) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await load()
    } catch (error) {
      setError(errorText(error))
    } finally {
      setLoading(false)
    }
  }
  async function action(run: () => Promise<unknown>, message = '已保存') {
    if (busy) return false
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await run()
      refreshAccount()
      refreshAdmin()
      await load()
      setSuccess(message)
      return true
    } catch (error) {
      setError(errorText(error))
      return false
    } finally {
      setBusy(false)
    }
  }
  function edit(model?: Model) {
    setError('')
    setSuccess('')
    setEditing(
      model ?? {
        id: '',
        name: '',
        version: 0,
        channels: [],
        capabilities: {
          referenceImages: true,
          aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
          resolutions: ['1K', '2K', '4K'],
        },
        priceMinor: 0,
        enabled: false,
        isDefault: false,
      },
    )
    setPrice(String((model?.priceMinor ?? 0) / 100))
  }
  async function saveModel(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const minor = parseCredits(price)
    if (minor === null || minor < 0) {
      setError('价格最多保留两位小数')
      return
    }
    if (
      await action(() =>
        request(`models${editing.id ? `/${editing.id}` : ''}`, editing.id ? 'PUT' : 'POST', {
          ...editing,
          priceMinor: minor,
        }),
      )
    )
      setEditing(null)
  }
  async function saveOperations(event: FormEvent) {
    event.preventDefault()
    if (!ops) return
    const minor = parseCredits(gift)
    if (minor === null || minor < 0) {
      setError('注册赠送金额格式不正确')
      return
    }
    const budget = parseCredits(giftBudget),
      alert = parseCredits(creditAlert)
    const reward = parseCredits(checkinReward),
      dailyCheckinBudget = parseCredits(checkinBudget)
    if (
      reward === null ||
      dailyCheckinBudget === null ||
      reward < 0 ||
      reward > 100000000 ||
      dailyCheckinBudget < 0
    ) {
      setError('签到奖励和预算需为有效非负数量，最多两位小数；单次奖励不超过 100 万')
      return
    }
    if (budget === null || alert === null || budget < 0 || alert < 0) {
      setError('每日赠送预算和消耗告警需为有效非负数量，最多两位小数')
      return
    }
    await action(() =>
      request('settings', 'PUT', {
        ...ops,
        signupGiftMinor: minor,
        signupGiftDailyBudgetMinor: budget,
        checkinRewardMinor: reward,
        checkinDailyBudgetMinor: dailyCheckinBudget,
        dailyCreditAlertMinor: alert,
      }),
    )
  }
  async function adjust(event: FormEvent) {
    event.preventDefault()
    if (!adjusting) return
    const delta = parseCredits(amount)
    if (delta === null || delta === 0) {
      setError('请输入有效的增加或扣减金额')
      return
    }
    if (
      await action(
        () =>
          request(`users/${adjusting.id}/balance`, 'POST', {
            deltaMinor: delta,
            note: note.trim(),
            requestKey: adjustmentKey,
          }),
        '余额已调整',
      )
    )
      setAdjusting(null)
  }
  const title = (
    {
      overview: '运营概览',
      models: '模型与定价',
      users: '用户与余额',
      operations: '运营设置',
      tasks: '生成任务',
      audit: '操作日志',
    } as const
  )[view]
  return (
    <main ref={editorHost} className={`ops-page${isList ? ' admin-list-page' : ''}`}>
      <AdminPageHeader
        title={title}
        actions={
          <div className="ops-heading-actions">
            {view === 'models' && (
              <Button onClick={() => edit()} disabled={busy || !endpoints.length}>
                <Plus data-icon="inline-start" />
                添加模型
              </Button>
            )}
            <Button variant="outline" disabled={busy || loading} onClick={() => void refresh()}>
              <RefreshCw data-icon="inline-start" />
              刷新
            </Button>
          </div>
        }
        tools={
          view === 'users' ? (
            <form className="ops-search" onSubmit={(event) => event.preventDefault()}>
              <label className="sr-only" htmlFor="member-search">
                搜索账号
              </label>
              <Input
                id="member-search"
                type="search"
                placeholder="输入用户名"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                maxLength={80}
              />
            </form>
          ) : undefined
        }
      />
      {error && !editing && !adjusting && (
        <Alert variant="destructive" className="settings-error" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="settings-saved" role="status">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      <div ref={listRegion} className={isList ? 'admin-list-region' : 'admin-page-body'}>
        {view === 'tasks' ? (
          <AdminTaskTable
            tasks={tasks}
            loading={loading}
            sorting={sorting}
            onSortingChange={changeSorting}
          />
        ) : loading && !isList ? (
          <p role="status">正在读取…</p>
        ) : (
          <>
            {view === 'overview' && (
              <>
                <AdminMonitoring unit={unit} />
                <AdminOverview overview={overview} unit={unit} />
              </>
            )}
            {view === 'models' && (
              <AdminModelList
                models={models}
                endpoints={endpoints}
                unit={unit}
                onEdit={edit}
                loading={loading}
                sorting={sorting}
                onSortingChange={changeSorting}
              />
            )}
            {view === 'users' && (
              <AdminUserTable
                members={members}
                unit={unit}
                loading={loading}
                busy={busy}
                sorting={sorting}
                onSortingChange={changeSorting}
                onAdjust={(member) => {
                  setAdjusting(member)
                  setAmount('')
                  setNote('')
                  setAdjustmentKey(crypto.randomUUID())
                  setError('')
                }}
                onToggle={async (member) => {
                  if (
                    member.status === 'active' &&
                    !(await ask({
                      title: '停用用户账号',
                      description: `确定停用账号「${member.username}」？`,
                      detail: '停用后该用户将无法继续访问账号功能，可在后台重新启用。',
                      confirmLabel: '停用账号',
                    }))
                  )
                    return
                  void action(() =>
                    request(`users/${member.id}`, 'PUT', {
                      role: member.role,
                      status: member.status === 'active' ? 'disabled' : 'active',
                    }),
                  )
                }}
              />
            )}
            {view === 'operations' && ops && (
              <AdminOperationsForm
                ops={ops}
                gift={gift}
                giftBudget={giftBudget}
                checkinReward={checkinReward}
                checkinBudget={checkinBudget}
                onCheckinRewardChange={setCheckinReward}
                onCheckinBudgetChange={setCheckinBudget}
                creditAlert={creditAlert}
                onGiftBudgetChange={setGiftBudget}
                onCreditAlertChange={setCreditAlert}
                busy={busy}
                onChange={setOps}
                onGiftChange={setGift}
                onSubmit={saveOperations}
              />
            )}
            {view === 'audit' && (
              <AdminAuditTable
                audit={audit}
                loading={loading}
                sorting={sorting}
                onSortingChange={changeSorting}
              />
            )}
          </>
        )}
      </div>
      {isList && (
        <AdminPagination
          {...pagination}
          label={
            {
              models: '模型',
              users: '用户',
              tasks: '任务',
              audit: '日志',
              overview: '',
              operations: '',
            }[view]
          }
          unit={view === 'users' ? '位' : view === 'models' ? '个' : '条'}
          pageSize={pageSize}
          loading={loading || busy}
          onPageChange={(next) => {
            if (next === pagination.page) return
            setLoading(true)
            setPage(next)
            setRevision((value) => value + 1)
          }}
          onPageSizeChange={(size) => {
            setLoading(true)
            setPage(1)
            setPageSize(size)
          }}
        />
      )}
      {editing && (
        <InfoDialog
          title={editing.id ? '编辑模型' : '添加模型'}
          hideActions
          onClose={() => {
            if (!busy) setEditing(null)
          }}
          portalContainer={editorHost.current}
        >
          {error && (
            <Alert variant="destructive" className="settings-error" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AdminModelEditor
            editing={editing}
            endpoints={endpoints}
            unit={unit}
            price={price}
            busy={busy}
            onChange={setEditing}
            onPriceChange={setPrice}
            onClose={() => setEditing(null)}
            onSubmit={saveModel}
          />
        </InfoDialog>
      )}
      {adjusting && (
        <InfoDialog
          title={`调整 ${adjusting.username} 的余额`}
          hideActions
          onClose={() => {
            if (!busy) setAdjusting(null)
          }}
          portalContainer={editorHost.current}
        >
          {error && (
            <Alert variant="destructive" className="settings-error" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AdminBalanceEditor
            amount={amount}
            note={note}
            unit={unit}
            busy={busy}
            onAmountChange={(value) => {
              setAmount(value)
              setAdjustmentKey(crypto.randomUUID())
            }}
            onNoteChange={(value) => {
              setNote(value)
              setAdjustmentKey(crypto.randomUUID())
            }}
            onClose={() => setAdjusting(null)}
            onSubmit={adjust}
          />
        </InfoDialog>
      )}
      {confirmation}
    </main>
  )
}
