'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { Popover } from 'radix-ui'
import { getAccessToken } from '@/lib/api'
import { frontendRequest } from '@/lib/frontend-request'
import { accountRevisionKey, formatCredits, type GenerationQuote } from '@/lib/credits'
import { useAccount } from './account-provider'
import { LoginLink } from './login-link'
const displayedPrices = new Map<string, number>()
export function displayedUnitPrice(modelId: string) {
  return displayedPrices.get(modelId)
}
export async function fetchGenerationQuote(
  modelId: string,
  count: number,
  signal?: AbortSignal,
): Promise<GenerationQuote> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 10_000)
  try {
    return await frontendRequest<GenerationQuote>(
      `generation/quote?${new URLSearchParams({ modelId, count: String(count) })}`,
      { signal: controller.signal },
      '暂时无法计算费用',
    )
  } catch (error) {
    if (timedOut) throw new Error('费用计算超时，请重试')
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
export function useGenerationCost(modelId: string | undefined, count: number) {
  const { account, loading } = useAccount()
  const [result, setResult] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    quote: GenerationQuote | null
    error: string
  } | null>(null)
  const [revision, setRevision] = useState(0)
  const token = typeof window === 'undefined' ? '' : getAccessToken()
  const validCount = Number.isInteger(count) && count >= 1 && count <= 16
  const eligible = !loading && account.authenticated && !!token && !!modelId && validCount
  const key = JSON.stringify([
    account.user?.id,
    token,
    modelId,
    count,
    account.available,
    revision,
    eligible,
  ])
  const current = eligible && result?.key === key ? result : null
  const unavailableReason = !modelId
    ? '选择可用模型后显示费用'
    : !validCount
      ? '请选择 1–16 张图片后计算费用'
      : !token
        ? '请重新登录后查看费用'
        : ''
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    const changed = (event: StorageEvent) => {
      if (event.key === accountRevisionKey) refresh()
    }
    window.addEventListener('istudio-account-refresh', refresh)
    window.addEventListener('storage', changed)
    return () => {
      window.removeEventListener('istudio-account-refresh', refresh)
      window.removeEventListener('storage', changed)
    }
  }, [])
  useEffect(() => {
    if (!eligible || !modelId) return
    let current = true
    const controller = new AbortController()
    setResult({ key, status: 'loading', quote: null, error: '' })
    const timer = setTimeout(() => {
      fetchGenerationQuote(modelId, count, controller.signal)
        .then((data) => {
          if (current) {
            displayedPrices.set(modelId, data.unitPriceMinor)
            setResult({ key, status: 'ready', quote: data, error: '' })
          }
        })
        .catch((error) => {
          if (current) {
            setResult({
              key,
              status: 'error',
              quote: null,
              error: error instanceof Error ? error.message : '费用读取失败',
            })
          }
        })
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [modelId, count, eligible, key])
  return {
    quote: current?.quote ?? null,
    error: current?.error ?? '',
    pending: eligible && (!current || current.status === 'loading'),
    unavailableReason,
    retry: () => setRevision((value) => value + 1),
    authenticated: account.authenticated,
    loading,
  }
}
export interface CreditHelpNavigation {
  href: string
  saveDraft: () => Promise<void>
}

type AvailableBalance = Pick<GenerationQuote, 'availableMinor' | 'creditName'>

function DraftCreditLink({ href, saveDraft }: CreditHelpNavigation) {
  const router = useRouter()
  const link = useRef<HTMLAnchorElement>(null)
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function openCredits() {
    if (pending.current) return
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await saveDraft()
      if (link.current?.isConnected) router.push(href)
    } catch {
      setError('草稿尚未保存，请重试后再获取积分。')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Link
        ref={link}
        href={href}
        aria-label={saving ? '保存草稿中' : '余额不足，获取积分'}
        aria-disabled={saving}
        onNavigate={(event) => {
          event.preventDefault()
          void openCredits()
        }}
      >
        {saving ? '保存草稿中…' : '余额不足 · 获取积分'}
      </Link>
      {error && (
        <span className="credit-estimate-draft-error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}

export function GenerationCost({
  quote,
  error,
  authenticated,
  loading,
  pending,
  unavailableReason,
  retry,
  fallbackBalance,
  creditHelp,
  popoverContainer,
}: ReturnType<typeof useGenerationCost> & {
  fallbackBalance?: AvailableBalance
  creditHelp?: CreditHelpNavigation
  popoverContainer?: HTMLElement | null
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [dialogContainer, setDialogContainer] = useState<HTMLElement | null>(null)
  const className = 'creation-credit-estimate creation-credit-estimate--summary'
  if (loading)
    return (
      <div className={className} role="status">
        正在读取账户信息…
      </div>
    )
  if (!authenticated)
    return (
      <div className={className}>
        <LoginLink>登录后查看余额与费用</LoginLink>
      </div>
    )
  const errorNotice = error && (
    <>
      <span>{error}</span>
      <button type="button" className="credit-estimate-retry" onClick={retry}>
        重新计算
      </button>
    </>
  )
  const pendingNotice = pending ? '正在计算费用…' : unavailableReason || '费用暂不可用'
  const unitPrice = quote
    ? `单价 ${formatCredits(quote.unitPriceMinor)} ${quote.creditName}/张 × ${quote.quantity} 张`
    : ''
  const creditLink =
    quote &&
    !quote.canAfford &&
    (creditHelp ? (
      <DraftCreditLink {...creditHelp} />
    ) : (
      <Link
        href="/account#credits"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="余额不足，获取积分（在新窗口打开）"
      >
        余额不足 · 获取积分
      </Link>
    ))
  const balance = quote ?? fallbackBalance
  return (
    <div className={className} aria-live="polite">
      <div className="credit-estimate-summary">
        {quote ? (
          <span className="credit-estimate-reserved">
            <span>
              预计预留{' '}
              <strong>
                {formatCredits(quote.totalMinor)} {quote.creditName}
              </strong>
            </span>
            <Popover.Root
              onOpenChange={(open) => {
                if (open && !popoverContainer) {
                  setDialogContainer(
                    trigger.current?.closest<HTMLElement>(
                      'dialog[open], [role="dialog"][aria-modal="true"]',
                    ) ?? null,
                  )
                }
              }}
            >
              <Popover.Trigger asChild>
                <button
                  ref={trigger}
                  type="button"
                  className="credit-estimate-info"
                  aria-label="查看费用明细"
                >
                  <Info size={14} aria-hidden="true" />
                </button>
              </Popover.Trigger>
              <Popover.Portal container={popoverContainer ?? dialogContainer}>
                <Popover.Content
                  className="credit-estimate-popover"
                  aria-label="费用明细"
                  side="top"
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                  hideWhenDetached
                >
                  {unitPrice}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </span>
        ) : (
          <span>{error ? '预计预留 —' : pendingNotice}</span>
        )}
        {balance && (
          <span className="credit-estimate-available">
            可用{' '}
            <span>
              {formatCredits(balance.availableMinor)} {balance.creditName}
            </span>
          </span>
        )}
      </div>
      {(errorNotice || creditLink) && (
        <div className="credit-estimate-status">{errorNotice || creditLink}</div>
      )}
    </div>
  )
}
