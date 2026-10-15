// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { settingsRequest } from '@/lib/ai-settings'
import Page from './page'
const state = vi.hoisted(() => ({
  id: 'alice',
  authenticated: true,
  loading: false,
  refresh: vi.fn(),
}))
vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: state.authenticated,
      user: state.authenticated ? { id: state.id, username: state.id } : undefined,
      available: 0,
      held: 0,
      creditName: '积分',
    },
    loading: state.loading,
    error: '',
    refresh: state.refresh,
  }),
}))
vi.mock('@/components/studio-shell', () => ({
  StudioShell: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <>
      {actions}
      {children}
    </>
  ),
}))
vi.mock('@/lib/ai-settings', () => ({ settingsRequest: vi.fn() }))
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(settingsRequest).mockReset()
  state.id = 'alice'
  state.authenticated = true
  state.loading = false
  state.refresh.mockReset()
  localStorage.setItem('istudio-access-token', 'alice-token')
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
it('never shows a previous customer ledger after an account switch', async () => {
  const pending: Array<(value: unknown) => void> = []
  vi.mocked(settingsRequest).mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  )
  const detail = (note: string) => ({
    available: 100,
    held: 0,
    creditName: '积分',
    ledger: [
      {
        id: 1,
        kind: 'adjustment',
        availableDelta: 100,
        heldDelta: 0,
        availableAfter: 100,
        heldAfter: 0,
        taskId: '',
        note,
        createdAt: '2026-10-15T00:00:00Z',
      },
    ],
  })
  await act(async () => root.render(<Page />))
  await act(async () => {
    state.id = 'bob'
    localStorage.setItem('istudio-access-token', 'bob-token')
    root.render(<Page />)
  })
  await act(async () => pending[1]!(detail('bob-private-ledger')))
  await act(async () => pending[0]!(detail('alice-private-ledger')))
  expect(container.textContent).toContain('bob-private-ledger')
  expect(container.textContent).not.toContain('alice-private-ledger')
})
it('shows a dedicated signed-out state without account controls or ledger requests', async () => {
  state.authenticated = false
  localStorage.clear()
  await act(async () => root.render(<Page />))
  expect(container.textContent).toContain('登录后查看个人中心')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/login?next=%2Faccount')
  expect(container.textContent).not.toContain('刷新余额')
  expect(container.querySelector('table')).toBeNull()
  expect(settingsRequest).not.toHaveBeenCalled()
})
it('waits for authentication before showing a login prompt', async () => {
  state.authenticated = false
  state.loading = true
  localStorage.clear()
  await act(async () => root.render(<Page />))
  expect(container.querySelector('[role="status"]')?.textContent).toContain('正在确认登录状态')
  expect(container.querySelector('a')).toBeNull()
  expect(settingsRequest).not.toHaveBeenCalled()
})
