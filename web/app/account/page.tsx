'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Coins, RefreshCw } from 'lucide-react'
import { StudioShell } from '@/components/studio-shell'
import { useAccount } from '@/components/account-provider'
import { AccountAccess } from '@/components/account-access'
import { frontendRequest } from '@/lib/frontend-request'
import { getAccessToken } from '@/lib/api'
import { accountRevisionKey, formatCredits, refreshAccount } from '@/lib/credits'
import { LibrarySelect } from '@/components/library-controls'
import { CreditBenefits } from '@/components/credit-benefits'
import { SiteContact } from '@/components/site-contact'
import type { CheckinState, CreditPolicy } from '@/lib/credit-policy'
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
  creditPolicy?: CreditPolicy
  available: number
  held: number
  creditName: string
  ledger: Entry[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
const kinds: Record<string, string> = {
  signup: '注册赠送',
  adjustment: '管理员调整',
  reserve: '生成预留',
  settlement: '生成结算',
  checkin: '签到奖励',
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
  const [claiming, setClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState('')
  const claimPending = useRef(false)
  const claimVersion = useRef(0)
  const load = useCallback(
    async (page = 1, pageSize = 20) => {
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
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
        const result = await frontendRequest<AccountDetail>(`account?${query}`, {
          signal: pending.signal,
        })
        if (!current()) return
        setSnapshot({ owner, data: result })
        refresh()
      } catch (error) {
        if (current() && !pending.signal.aborted)
          setError(error instanceof Error ? error.message : '读取失败')
      } finally {
        if (current()) setBusy(false)
      }
    },
    [owner, refresh],
  )
  useEffect(() => {
    setSnapshot(null)
    setError('')
    setBusy(false)
    setClaiming(false)
    setClaimMessage('')
    claimPending.current = false
    void load()
    return () => {
      requestVersion.current++
      controller.current?.abort()
      claimVersion.current++
    }
  }, [load])
  useEffect(() => {
    if (!owner) return
    const revalidate = () => {
      if (document.visibilityState !== 'hidden') void load()
    }
    const changed = (event: StorageEvent) => {
      if (event.key === accountRevisionKey) revalidate()
    }
    window.addEventListener('focus', revalidate)
    window.addEventListener('storage', changed)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('storage', changed)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [owner, load])
  const resetAfter = data?.creditPolicy?.checkin.refreshAfterSeconds
  useEffect(() => {
    if (!resetAfter || resetAfter < 1) return
    const timer = window.setTimeout(() => void load(), (resetAfter + 1) * 1000)
    return () => window.clearTimeout(timer)
  }, [resetAfter, load])
  async function claim() {
    if (claimPending.current || !data?.creditPolicy?.checkin.canClaim) return
    claimPending.current = true
    const token = getAccessToken(),
      version = ++claimVersion.current
    const current = () => version === claimVersion.current && token === getAccessToken()
    setClaiming(true)
    setClaimMessage('')
    try {
      const result = await frontendRequest<{
        checkin: CheckinState
        availableMinor: number
        heldMinor: number
      }>('account/checkin', { method: 'POST' })
      if (!current()) return
      setSnapshot((previous) =>
        previous?.owner === owner && previous.data.creditPolicy
          ? {
              owner,
              data: {
                ...previous.data,
                available: result.availableMinor,
                held: result.heldMinor,
                creditPolicy: { ...previous.data.creditPolicy, checkin: result.checkin },
              },
            }
          : previous,
      )
      setClaimMessage(
        `已领取 ${formatCredits(result.checkin.claimedRewardMinor)} ${data.creditName}，可在流水中核对。`,
      )
      refreshAccount()
      await load()
    } catch (error) {
      if (!current()) return
      setClaimMessage(error instanceof Error ? error.message : '领取失败，请重试')
      // A lost response may follow a committed award. Re-read before allowing a retry.
      await load()
    } finally {
      if (current()) {
        claimPending.current = false
        setClaiming(false)
      }
    }
  }
  return (
    <StudioShell
      section="settings"
      title="个人中心"
      actions={
        account.authenticated ? (
          <button
            className="studio-secondary"
            disabled={busy || !account.authenticated}
            onClick={() => void load(data?.page ?? 1, data?.pageSize ?? 20)}
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
            {data?.creditPolicy && (
              <CreditBenefits
                policy={data.creditPolicy}
                unit={data.creditName}
                claiming={claiming}
                message={claimMessage}
                onClaim={() => void claim()}
              />
            )}
            <SiteContact />
            <section className="ops-card" aria-labelledby="account-ledger-title" aria-busy={busy}>
              <div className="ops-card-heading">
                <h2 id="account-ledger-title">流水记录</h2>
                <span>共 {data?.total ?? 0} 条</span>
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
                      ? '正在读取流水记录…'
                      : error
                        ? '流水记录读取失败，请刷新重试。'
                        : '暂无余额变动。'}
                  </p>
                )}
              </div>
              <nav className="ops-pagination account-pagination" aria-label="流水记录分页">
                <div className="ops-pagination-summary" aria-live="polite">
                  <span>
                    第 {data?.total ? (data.page - 1) * data.pageSize + 1 : 0}–
                    {data ? Math.min(data.page * data.pageSize, data.total) : 0} 条，共{' '}
                    {data?.total ?? 0} 条
                  </span>
                  {busy && <span role="status">正在读取…</span>}
                </div>
                <LibrarySelect
                  label="每页流水记录条数"
                  value={String(data?.pageSize ?? 20)}
                  options={[
                    ['20', '20 条 / 页'],
                    ['50', '50 条 / 页'],
                    ['100', '100 条 / 页'],
                  ]}
                  disabled={busy || !data}
                  onChange={(value) => void load(1, Number(value))}
                />
                <span>
                  第 {data?.page ?? 1} / {data?.totalPages ?? 1} 页
                </span>
                <div className="ops-pagination-buttons">
                  <button
                    type="button"
                    aria-label="上一页流水记录"
                    disabled={busy || !data || data.page <= 1}
                    onClick={() => data && void load(data.page - 1, data.pageSize)}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="下一页流水记录"
                    disabled={busy || !data || data.page >= data.totalPages}
                    onClick={() => data && void load(data.page + 1, data.pageSize)}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            </section>
          </>
        )}
      </main>
    </StudioShell>
  )
}
