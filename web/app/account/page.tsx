'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { StudioShell } from '@/components/studio-shell'
import { useAccount } from '@/components/account-provider'
import { AccountAccess } from '@/components/account-access'
import { settingsRequest } from '@/lib/ai-settings'
import { getAccessToken } from '@/lib/api'
import { formatCredits } from '@/lib/credits'
interface Entry {
  id: number
  kind: string
  availableDelta: number
  heldDelta: number
  availableAfter: number
  heldAfter: number
  taskId: string
  note: string
  createdAt: string
}
interface AccountDetail {
  available: number
  held: number
  creditName: string
  ledger: Entry[]
}
const kinds: Record<string, string> = {
  signup: '注册赠送',
  adjustment: '管理员调整',
  reserve: '生成预留',
  settlement: '生成结算',
}
export default function AccountPage() {
  const { account, refresh } = useAccount()
  const owner = account.user?.id ?? ''
  const [snapshot, setSnapshot] = useState<{ owner: string; data: AccountDetail } | null>(null)
  const data = snapshot?.owner === owner ? snapshot.data : null
  const requestVersion = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!owner || !token) return
    const version = ++requestVersion.current
    controller.current?.abort()
    const pending = new AbortController()
    controller.current = pending
    const current = () => version === requestVersion.current && token === getAccessToken()
    setBusy(true)
    setError('')
    try {
      const result = await settingsRequest<AccountDetail>(
        'account',
        'GET',
        undefined,
        pending.signal,
      )
      if (!current()) return
      setSnapshot({ owner, data: result })
      refresh()
    } catch (error) {
      if (current() && !pending.signal.aborted)
        setError(error instanceof Error ? error.message : '读取失败')
    } finally {
      if (current()) setBusy(false)
    }
  }, [owner, refresh])
  useEffect(() => {
    setSnapshot(null)
    setError('')
    setBusy(false)
    void load()
    return () => {
      requestVersion.current++
      controller.current?.abort()
    }
  }, [load])
  return (
    <StudioShell
      section="settings"
      title="个人中心"
      actions={
        account.authenticated ? (
          <button
            className="studio-secondary"
            disabled={busy || !account.authenticated}
            onClick={() => void load()}
          >
            <RefreshCw size={15} />
            刷新余额
          </button>
        ) : (
          false
        )
      }
    >
      <main className="ops-page account-page">
        {!account.authenticated ? (
          <AccountAccess
            title="登录后查看个人中心"
            description="查看账户余额、生成消费和每一笔余额变动。"
            returnTo="/account"
          />
        ) : (
          <>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
            <div className="ops-stats">
              <article>
                <span>
                  <Coins size={16} />
                  可用{data?.creditName ?? account.creditName}
                </span>
                <strong>{formatCredits(data?.available ?? account.available)}</strong>
              </article>
              <article>
                <span>生成中预留</span>
                <strong>{formatCredits(data?.held ?? account.held)}</strong>
                <small>生成完成后按实际交付结算，未使用部分自动退回</small>
              </article>
            </div>
            <section className="ops-card">
              <div className="ops-card-heading">
                <h2>余额流水</h2>
                <span>最近 100 条</span>
              </div>
              <div className="ops-table-scroll">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>用途</th>
                      <th>可用变动</th>
                      <th>预留变动</th>
                      <th>可用余额</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.ledger.map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
                        <td>{kinds[item.kind] ?? item.kind}</td>
                        <td>
                          {item.availableDelta > 0 ? '+' : ''}
                          {formatCredits(item.availableDelta)}
                        </td>
                        <td>
                          {item.heldDelta > 0 ? '+' : ''}
                          {formatCredits(item.heldDelta)}
                        </td>
                        <td>{formatCredits(item.availableAfter)}</td>
                        <td>{item.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data?.ledger.length && (
                  <p className="ops-empty" role={busy ? 'status' : undefined}>
                    {busy
                      ? '正在读取余额流水…'
                      : error
                        ? '余额流水读取失败，请刷新重试。'
                        : '暂无余额变动；需要增加余额时请联系网站管理员。'}
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </StudioShell>
  )
}
