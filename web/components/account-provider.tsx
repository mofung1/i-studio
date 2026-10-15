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
import { apiBaseUrl, getAccessToken, getAdminAccessToken } from '@/lib/api'

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
const AdminAccountContext = createContext({
  account: empty,
  loading: true,
  error: '',
  refresh: () => {},
})

export function AccountProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
export function AdminAccountProvider({ children }: { children: ReactNode }) {
  return <SessionProvider admin>{children}</SessionProvider>
}
function SessionProvider({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const [account, setAccount] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const version = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const lastToken = useRef('')
  const refresh = useCallback(() => {
    const readToken = admin ? getAdminAccessToken : getAccessToken
    const token = readToken()
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
    const current = () => version.current === requestVersion && readToken() === token
    fetch(`${apiBaseUrl}/v1/${admin ? 'admin/auth/me' : 'auth/me'}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: pending.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('账户暂时无法读取，请重试')
        return response.json() as Promise<AccountState>
      })
      .then((data) => {
        if (!current()) return
        setAccount(data.authenticated ? { ...empty, ...data } : empty)
        setError('')
      })
      .catch((error: Error) => {
        if (current() && !pending.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (current()) setLoading(false)
      })
  }, [admin])
  useEffect(() => {
    const tokenKey = admin ? 'istudio-admin-token' : 'istudio-access-token'
    const refreshEvent = admin ? 'istudio-admin-refresh' : 'istudio-account-refresh'
    const storageChanged = (event: StorageEvent) => {
      if (event.key === tokenKey || event.key === null) refresh()
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
  }, [refresh, admin])
  const Context = admin ? AdminAccountContext : AccountContext
  return (
    <Context.Provider value={{ account, loading, error, refresh }}>{children}</Context.Provider>
  )
}
export function useAccount() {
  return useContext(AccountContext)
}

export function useAdminAccount() {
  return useContext(AdminAccountContext)
}
