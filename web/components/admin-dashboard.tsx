'use client'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import type { AIEndpoint } from '@/lib/ai-settings'
import { formatCredits, parseCredits, refreshAccount } from '@/lib/credits'
import { useAdminAccount } from './account-provider'
import type {
  AdminModel as Model,
  AdminMember as Member,
  AdminOperations as Operations,
  AdminTask as Task,
  AdminAudit as Audit,
} from '@/lib/admin'
import { AdminTable as Table } from './admin/table'
import { adminRequest as request } from '@/lib/admin'
import { AdminOverview } from './admin/overview'
import { AdminModelList } from './admin/model-list'
import { AdminTaskTable } from './admin/task-table'
import { AdminAuditTable } from './admin/audit-table'
import { AdminOperationsForm } from './admin/operations-form'
import { AdminModelEditor } from './admin/model-editor'
import { AdminBalanceEditor } from './admin/balance-editor'

const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请重试')

export function AdminDashboard({
  view,
}: {
  view: 'overview' | 'models' | 'users' | 'operations' | 'tasks' | 'audit'
}) {
  const { account, refresh: refreshAdmin } = useAdminAccount()
  const [models, setModels] = useState<Model[]>([])
  const [endpoints, setEndpoints] = useState<AIEndpoint[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [overview, setOverview] = useState<Record<string, number>>({})
  const [ops, setOps] = useState<Operations | null>(null)
  const [gift, setGift] = useState('0')
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
  const unit = account.creditName
  const load = useCallback(async () => {
    const version = ++loadVersion.current
    const current = () => version === loadVersion.current
    if (view === 'overview') {
      const data = await request<Record<string, number>>('overview')
      if (current()) setOverview(data)
    }
    if (view === 'models') {
      const [catalog, services] = await Promise.all([
        request<{ models: Model[] }>('models'),
        request<{ endpoints: AIEndpoint[] }>('ai-endpoints'),
      ])
      if (current()) {
        setModels(catalog.models)
        setEndpoints(services.endpoints.filter((item) => item.purpose === 'image'))
      }
    }
    if (view === 'users') {
      const data = await request<{ users: Member[] }>(`users?q=${encodeURIComponent(query)}`)
      if (current()) setMembers(data.users)
    }
    if (view === 'operations') {
      const settings = await request<Operations>('settings')
      if (current()) {
        setOps(settings)
        setGift(String(settings.signupGiftMinor / 100))
      }
    }
    if (view === 'tasks') {
      const data = await request<{ tasks: Task[] }>('tasks')
      if (current()) setTasks(data.tasks)
    }
    if (view === 'audit') {
      const data = await request<{ audit: Audit[] }>('audit')
      if (current()) setAudit(data.audit)
    }
  }, [view, query])
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
        endpointId: endpoints[0]?.id ?? '',
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
    await action(() => request('settings', 'PUT', { ...ops, signupGiftMinor: minor }))
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
  const meta = {
    overview: ['运营概览', '查看账户、任务和积分使用情况。'],
    models: ['模型与定价', `每张图片单独计价，保存后对新任务生效。价格单位：${unit}。`],
    users: ['用户与余额', '管理账户权限，发放或调整可用余额。'],
    operations: ['运营设置', '统一前台积分名称、注册策略与使用上限。'],
    tasks: ['生成任务', '查看生成状态、结算与退款；用户图片和提示词保持私有。'],
    audit: ['操作日志', '记录管理员的配置、权限和余额变更。'],
  }[view]
  return (
    <main className="ops-page">
      <div className="ops-heading">
        <div>
          <p className="ops-eyebrow">平台管理</p>
          <h1>{meta[0]}</h1>
          <p>{meta[1]}</p>
        </div>
        <div className="ops-heading-actions">
          {view === 'models' && (
            <button
              className="settings-primary"
              onClick={() => edit()}
              disabled={busy || !endpoints.length}
            >
              <Plus size={16} />
              添加模型
            </button>
          )}
          <button
            className="settings-command"
            disabled={busy || loading}
            onClick={() => void action(async () => {}, '已刷新')}
          >
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </div>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="settings-saved" role="status">
          {success}
        </p>
      )}
      {view === 'users' && (
        <form className="ops-search" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="member-search">搜索账号</label>
          <input
            id="member-search"
            type="search"
            placeholder="输入用户名"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={80}
          />
        </form>
      )}
      {loading ? (
        <p role="status">正在读取…</p>
      ) : (
        <>
          {view === 'overview' && <AdminOverview overview={overview} unit={unit} />}
          {view === 'models' && (
            <AdminModelList models={models} endpoints={endpoints} unit={unit} onEdit={edit} />
          )}
          {view === 'users' && (
            <>
              <section className="ops-card">
                <Table
                  headings={['账号', '角色', '可用余额', '预留余额', '状态', '操作']}
                  empty={!members.length}
                >
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.username}</strong>
                      </td>
                      <td>用户</td>
                      <td>
                        {formatCredits(member.available)} {unit}
                      </td>
                      <td>{formatCredits(member.held)}</td>
                      <td>{member.status === 'active' ? '启用' : '停用'}</td>
                      <td>
                        <div className="ops-row-actions">
                          <button
                            className="settings-command"
                            disabled={busy}
                            onClick={() => {
                              setAdjusting(member)
                              setAmount('')
                              setNote('')
                              setAdjustmentKey(crypto.randomUUID())
                              setError('')
                            }}
                          >
                            调整余额
                          </button>
                          <button
                            className="settings-command"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${member.status === 'active' ? '停用' : '启用'}账号 ${member.username}？`,
                                )
                              )
                                void action(() =>
                                  request(`users/${member.id}`, 'PUT', {
                                    role: member.role,
                                    status: member.status === 'active' ? 'disabled' : 'active',
                                  }),
                                )
                            }}
                          >
                            {member.status === 'active' ? '停用' : '启用'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </section>
            </>
          )}
          {view === 'operations' && ops && (
            <AdminOperationsForm
              ops={ops}
              gift={gift}
              busy={busy}
              onChange={setOps}
              onGiftChange={setGift}
              onSubmit={saveOperations}
            />
          )}
          {view === 'tasks' && <AdminTaskTable tasks={tasks} />}
          {view === 'audit' && <AdminAuditTable audit={audit} />}
        </>
      )}
      {editing && (
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
      )}
      {adjusting && (
        <AdminBalanceEditor
          adjusting={adjusting}
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
      )}
    </main>
  )
}
