'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiBaseUrl, getAccessToken } from '@/lib/api'
import { accountRevisionKey } from '@/lib/credits'

export interface AccountState {
  authenticated: boolean
  user?: { id: string; username: string; role: string }
  available: number
  held: number
  creditName: string
}
const empty: AccountState = { authenticated: false, available: 0, held: 0, creditName: '积分' }
const AccountContext = createContext<{
  account: AccountState
  loading: boolean
  error: string
  refresh: () => void
}>({ account: empty, loading: true, error: '', refresh: () => {} })
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const version = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const lastToken = useRef('')
  const refresh = useCallback(() => {
    const token = getAccessToken()
    const requestVersion = ++version.current
    controller.current?.abort()
    if (token !== lastToken.current) {
      setAccount(empty)
      setLoading(true)
    }
    lastToken.current = token
    if (!token) {
      setAccount(empty)
      setLoading(false)
      setError('')
      return
    }
    const pending = new AbortController()
    controller.current = pending
    const current = () => version.current === requestVersion && getAccessToken() === token
    fetch(`${apiBaseUrl}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: pending.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return { ...empty }
        if (!response.ok) throw new Error('账户暂时无法读取，请重试')
        return response.json() as Promise<AccountState>
      })
      .then((data) => {
        if (!current()) return
        setAccount(data.authenticated ? { ...empty, ...data } : empty)
        if (!data.authenticated) {
          window.localStorage.removeItem('istudio-access-token')
          lastToken.current = ''
        }
        setError('')
      })
      .catch((error: Error) => {
        if (current() && !pending.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (current()) setLoading(false)
      })
  }, [])
  useEffect(() => {
    const tokenKey = 'istudio-access-token'
    const refreshEvent = 'istudio-account-refresh'
    const storageChanged = (event: StorageEvent) => {
      if (event.key === tokenKey || event.key === null || event.key === accountRevisionKey)
        refresh()
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener(refreshEvent, refresh)
    window.addEventListener('storage', storageChanged)
    return () => {
      version.current++
      controller.current?.abort()
      window.removeEventListener('focus', refresh)
      window.removeEventListener(refreshEvent, refresh)
      window.removeEventListener('storage', storageChanged)
    }
  }, [refresh])
  return (
    <AccountContext.Provider value={{ account, loading, error, refresh }}>
      {children}
    </AccountContext.Provider>
  )
}
export function useAccount() {
  return useContext(AccountContext)
}
