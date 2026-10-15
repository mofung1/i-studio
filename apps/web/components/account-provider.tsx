'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiBaseUrl, getAccessToken } from '@/lib/api'

export interface AccountState { authenticated: boolean; user?: { id: string; username: string; role: string }; available: number; held: number; creditName: string }
const empty: AccountState = { authenticated: false, available: 0, held: 0, creditName: '积分' }
const AccountContext = createContext<{ account: AccountState; loading: boolean; error: string; refresh: () => void }>({ account: empty, loading: true, error: '', refresh: () => {} })
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    const token = getAccessToken()
    if (!token) { setAccount(empty); setLoading(false); setError(''); return }
    fetch(`${apiBaseUrl}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('账户暂时无法读取，请重试'); return response.json() as Promise<AccountState> })
      .then(data => { setAccount(data.authenticated ? data : empty); setError('') })
      .catch((error: Error) => setError(error.message)).finally(() => setLoading(false))
  }, [])
  useEffect(() => { refresh(); window.addEventListener('focus', refresh); window.addEventListener('istudio-account-refresh', refresh); return () => { window.removeEventListener('focus', refresh); window.removeEventListener('istudio-account-refresh', refresh) } }, [refresh])
  return <AccountContext.Provider value={{ account, loading, error, refresh }}>{children}</AccountContext.Provider>
}
export function useAccount() { return useContext(AccountContext) }
