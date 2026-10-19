// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OverlayRoot } from '../overlay-root'
import { AdminWorkspaceShell } from './workspace'
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/models',
}))
vi.mock('../account-provider', () => ({
  useAdminAccount: () => ({ account: { user: { username: 'operator' } }, refresh }),
}))
vi.mock('../theme-toggle', () => ({ ThemeToggle: () => <button>主题</button> }))
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  refresh.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('keeps route navigation while removing page search and the category menu entry', async () => {
  await act(async () =>
    root.render(
      <OverlayRoot className="admin-shell">
        <AdminWorkspaceShell>
          <h1>模型</h1>
        </AdminWorkspaceShell>
      </OverlayRoot>,
    ),
  )
  expect(host.querySelector('nav[aria-label="后台导航"] [aria-current="page"]')?.textContent).toBe(
    '模型与定价',
  )
  expect(host.textContent).not.toContain('搜索后台页面')
  expect(host.querySelector('a[href="/admin/inspiration/categories"]')).toBeNull()
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    ),
  )
  expect(host.querySelector('[role="dialog"]')).toBeNull()
})
it('only clears the administrator session when logging out', async () => {
  localStorage.setItem('istudio-admin-token', 'admin-token')
  localStorage.setItem('istudio-access-token', 'customer-token')
  await act(async () =>
    root.render(
      <OverlayRoot className="admin-shell">
        <AdminWorkspaceShell>内容</AdminWorkspaceShell>
      </OverlayRoot>,
    ),
  )
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="账户菜单"]')!
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  const logout = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes('退出后台'),
  )!
  expect(logout).toBeDefined()
  await act(async () => logout.click())
  expect(localStorage.getItem('istudio-admin-token')).toBeNull()
  expect(localStorage.getItem('istudio-access-token')).toBe('customer-token')
  expect(refresh).toHaveBeenCalledOnce()
})
