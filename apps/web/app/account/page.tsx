'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Coins, RefreshCw } from 'lucide-react'
import { StudioShell } from '@/components/studio-shell'
import { useAccount } from '@/components/account-provider'
import { settingsRequest } from '@/lib/ai-settings'
import { formatCredits } from '@/lib/credits'
interface Entry { id: number; kind: string; availableDelta: number; heldDelta: number; availableAfter: number; heldAfter: number; taskId: string; note: string; createdAt: string }
interface AccountDetail { available: number; held: number; creditName: string; ledger: Entry[] }
const kinds: Record<string, string> = { signup: '注册赠送', adjustment: '管理员调整', reserve: '生成预留', settlement: '生成结算' }
export default function AccountPage() {
  const { account, loading, refresh } = useAccount()
  const [data, setData] = useState<AccountDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() { setBusy(true); setError(''); try { setData(await settingsRequest<AccountDetail>('account')); refresh() } catch (error) { setError(error instanceof Error ? error.message : '读取失败') } finally { setBusy(false) } }
  useEffect(() => { if (account.authenticated) void load() }, [account.authenticated])
  return <StudioShell section="settings" title="个人中心" actions={<button className="studio-secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={15} />刷新余额</button>}><main className="ops-page">
    {loading ? <p role="status">正在读取账户…</p> : !account.authenticated ? <div className="ops-empty"><h1>登录后查看余额和使用记录</h1><Link className="settings-primary" href="/login?next=%2Faccount">登录 / 注册</Link></div> : <>
      <div className="ops-heading"><div><p className="ops-eyebrow">我的账户</p><h1>{account.user?.username}</h1><p>创作消费与余额变动，都在这里。</p></div>{account.user?.role === 'admin' && <Link className="settings-command" href="/admin">进入运营后台<ArrowUpRight size={16} /></Link>}</div>
      {error && <p role="alert" className="settings-error">{error}</p>}
      <div className="ops-stats"><article><span><Coins size={16} />可用{data?.creditName ?? account.creditName}</span><strong>{formatCredits(data?.available ?? account.available)}</strong></article><article><span>生成中预留</span><strong>{formatCredits(data?.held ?? account.held)}</strong><small>生成完成后按实际交付结算，未使用部分自动退回</small></article></div>
      <section className="ops-card"><div className="ops-card-heading"><h2>余额流水</h2><span>最近 100 条</span></div><div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>时间</th><th>用途</th><th>可用变动</th><th>预留变动</th><th>可用余额</th><th>说明</th></tr></thead><tbody>{data?.ledger.map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{kinds[item.kind] ?? item.kind}</td><td>{item.availableDelta > 0 ? '+' : ''}{formatCredits(item.availableDelta)}</td><td>{item.heldDelta > 0 ? '+' : ''}{formatCredits(item.heldDelta)}</td><td>{formatCredits(item.availableAfter)}</td><td>{item.note}</td></tr>)}</tbody></table>{!data?.ledger.length && <p className="ops-empty">暂无余额变动；需要增加余额时请联系网站管理员。</p>}</div></section>
    </>}
  </main></StudioShell>
}
