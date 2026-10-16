'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getAccessToken } from '@/lib/api'
import { frontendRequest } from '@/lib/frontend-request'
import { formatCredits, type GenerationQuote } from '@/lib/credits'
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
    window.addEventListener('istudio-account-refresh', refresh)
    return () => window.removeEventListener('istudio-account-refresh', refresh)
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
export function GenerationCost({
  quote,
  error,
  authenticated,
  loading,
  pending,
  unavailableReason,
  retry,
}: ReturnType<typeof useGenerationCost>) {
  if (loading)
    return (
      <div className="creation-credit-estimate" role="status">
        正在读取账户信息…
      </div>
    )
  if (!authenticated)
    return (
      <div className="creation-credit-estimate">
        <LoginLink>登录后查看余额与费用</LoginLink>
      </div>
    )
  if (error)
    return (
      <div className="creation-credit-estimate" role="status">
        <span>{error}</span>
        <button type="button" className="credit-estimate-retry" onClick={retry}>
          重新计算
        </button>
      </div>
    )
  return (
    <div className="creation-credit-estimate" aria-live="polite">
      {quote ? (
        <>
          <span>
            预计扣除{' '}
            <strong>
              {formatCredits(quote.totalMinor)} {quote.creditName}
            </strong>
          </span>
          <span>
            可用余额{' '}
            <strong>
              {formatCredits(quote.availableMinor)} {quote.creditName}
            </strong>
            {!quote.canAfford && (
              <>
                {' '}
                · <Link href="/account">余额不足</Link>
              </>
            )}
          </span>
        </>
      ) : (
        <span>{pending ? '正在计算费用…' : unavailableReason || '费用暂不可用'}</span>
      )}
    </div>
  )
}
