// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  AccountProvider,
  AdminAccountProvider,
  useAccount,
  useAdminAccount,
} from './account-provider'

let root: Root
let container: HTMLDivElement
let pending: Array<{ url: string; token: string; resolve: (value: Response) => void }>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  pending = []
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, options: RequestInit) =>
        new Promise<Response>((resolve) => {
          pending.push({
            url,
            token: (options.headers as Record<string, string>).Authorization!,
            resolve,
          })
        }),
    ),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})
function View() {
  const web = useAccount()
  const admin = useAdminAccount()
  return (
    <>
      <output data-web>
        {web.account.user?.username ?? 'signed-out'}:{web.account.available}
      </output>
      <output data-admin>{admin.account.user?.username ?? 'signed-out'}</output>
    </>
  )
}
async function resolve(index: number, username: string, available = 0) {
  await act(async () =>
    pending[index]!.resolve(
      new Response(
        JSON.stringify({
          authenticated: true,
          user: { id: username, username, role: 'user' },
          available,
          held: 0,
          creditName: '积分',
        }),
      ),
    ),
  )
}
it('keeps frontend and administrator credentials in independent sessions', async () => {
  localStorage.setItem('istudio-access-token', 'web-token')
  localStorage.setItem('istudio-admin-token', 'admin-token')
  await act(async () =>
    root.render(
      <AccountProvider>
        <AdminAccountProvider>
          <View />
        </AdminAccountProvider>
      </AccountProvider>,
    ),
  )
  const webIndex = pending.findIndex((item) => item.url.endsWith('/v1/auth/me'))
  const adminIndex = pending.findIndex((item) => item.url.endsWith('/v1/admin/auth/me'))
  expect(pending[webIndex]!.token).toBe('Bearer web-token')
  expect(pending[adminIndex]!.token).toBe('Bearer admin-token')
  await resolve(webIndex, 'customer', 1200)
  await resolve(adminIndex, 'operator')
  await act(async () => {
    localStorage.removeItem('istudio-access-token')
    window.dispatchEvent(new Event('istudio-account-refresh'))
  })
  expect(container.querySelector('[data-web]')?.textContent).toBe('signed-out:0')
  expect(container.querySelector('[data-admin]')?.textContent).toBe('operator')
  expect(localStorage.getItem('istudio-admin-token')).toBe('admin-token')
})
it('ignores an old account response after switching accounts or logging out', async () => {
  localStorage.setItem('istudio-access-token', 'first')
  await act(async () =>
    root.render(
      <AccountProvider>
        <View />
      </AccountProvider>,
    ),
  )
  await act(async () => {
    localStorage.setItem('istudio-access-token', 'second')
    window.dispatchEvent(new StorageEvent('storage', { key: 'istudio-access-token' }))
  })
  await resolve(1, 'second', 2500)
  await resolve(0, 'first', 9999)
  expect(container.querySelector('[data-web]')?.textContent).toBe('second:2500')
  await act(async () => window.dispatchEvent(new Event('focus')))
  await act(async () => {
    localStorage.removeItem('istudio-access-token')
    window.dispatchEvent(new Event('istudio-account-refresh'))
  })
  await resolve(2, 'second', 7777)
  expect(container.querySelector('[data-web]')?.textContent).toBe('signed-out:0')
})
