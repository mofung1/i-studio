'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import { formatCredits, type GenerationQuote } from '@/lib/credits'
import { useAccount } from './account-provider'
const displayedPrices = new Map<string, number>()
export function displayedUnitPrice(modelId: string) {
  return displayedPrices.get(modelId)
}
export async function fetchGenerationQuote(
  modelId: string,
  count: number,
): Promise<GenerationQuote> {
  const response = await fetch(
    `${apiBaseUrl}/v1/generation/quote?${new URLSearchParams({ modelId, count: String(count) })}`,
    { headers: { Authorization: `Bearer ${getAccessToken()}` }, cache: 'no-store' },
  )
  if (!response.ok) throw new Error(await readApiError(response, '暂时无法计算费用'))
  return response.json() as Promise<GenerationQuote>
}
export function useGenerationCost(modelId: string | undefined, count: number) {
  const { account } = useAccount()
  const [quote, setQuote] = useState<GenerationQuote | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const key = `${modelId}:${count}:${account.available}`
  const [loadedKey, setLoadedKey] = useState('')
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener('istudio-account-refresh', refresh)
    return () => window.removeEventListener('istudio-account-refresh', refresh)
  }, [])
  useEffect(() => {
    let current = true
    setError('')
    setQuote(null)
    if (!account.authenticated || !modelId || count < 1 || count > 16) return
    const timer = setTimeout(() => {
      fetchGenerationQuote(modelId, count)
        .then((data) => {
          if (current) {
            displayedPrices.set(modelId, data.unitPriceMinor)
            setQuote(data)
            setLoadedKey(key)
          }
        })
        .catch((error) => {
          if (current) {
            setError(error instanceof Error ? error.message : '费用读取失败')
            setLoadedKey(key)
          }
        })
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [modelId, count, account.authenticated, key, revision])
  return { quote: loadedKey === key ? quote : null, error, authenticated: account.authenticated }
}
export function GenerationCost({
  quote,
  error,
  authenticated,
}: ReturnType<typeof useGenerationCost>) {
  if (!authenticated)
    return (
      <div className="creation-credit-estimate">
        <Link href="/login?next=%2Fworkbench">登录后查看余额与费用</Link>
      </div>
    )
  if (error)
    return (
      <div className="creation-credit-estimate" role="status">
        {error}
      </div>
    )
  return (
    <div className="creation-credit-estimate" aria-live="polite">
      {quote ? (
        <>
          <span>
            预计{' '}
            <strong>
              {formatCredits(quote.totalMinor)} {quote.creditName}
            </strong>
          </span>
          <span>
            可用 {formatCredits(quote.availableMinor)}
            {!quote.canAfford && (
              <>
                {' '}
                · <Link href="/account">余额不足</Link>
              </>
            )}
          </span>
        </>
      ) : (
        <span>正在计算费用…</span>
      )}
    </div>
  )
}
