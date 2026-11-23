// @vitest-environment jsdom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { createTestRoot } from '@/test/router'
import { AdminShell } from './admin-shell'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/components/account-provider', () => ({
  useAdminAccount: () => ({ account: { user: { username: 'operator' } }, refresh }),
}))

it('keeps the customer signed in when the operator logs out through the sidebar', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  localStorage.setItem('istudio-admin-token', 'admin-token')
  localStorage.setItem('istudio-access-token', 'customer-token')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createTestRoot(host)
  try {
    await act(async () => root.render(<AdminShell>运营概览</AdminShell>))
    const logout = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === '退出后台',
    )
    expect(logout).toBeDefined()
    await act(async () => logout!.click())
    expect(localStorage.getItem('istudio-admin-token')).toBeNull()
    expect(localStorage.getItem('istudio-access-token')).toBe('customer-token')
    expect(refresh).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})
