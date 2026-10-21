// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { frontendRequest } from '@/lib/frontend-request'
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
vi.mock('@/lib/frontend-request', () => ({ frontendRequest: vi.fn() }))
vi.mock('@/components/library-controls', () => ({
  LibrarySelect: ({
    label,
    value,
    options,
    disabled,
    onChange,
  }: {
    label: string
    value: string
    options: [string, string][]
    disabled: boolean
    onChange: (value: string) => void
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  ),
}))
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(frontendRequest).mockReset()
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
  vi.mocked(frontendRequest).mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  )
  const detail = (note: string) => ({
    available: 100,
    held: 0,
    creditName: '积分',
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
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
  expect(frontendRequest).not.toHaveBeenCalled()
})
it('waits for authentication before showing a login prompt', async () => {
  state.authenticated = false
  state.loading = true
  localStorage.clear()
  await act(async () => root.render(<Page />))
  expect(container.querySelector('[role="status"]')?.textContent).toContain('正在确认登录状态')
  expect(container.querySelector('a')).toBeNull()
  expect(frontendRequest).not.toHaveBeenCalled()
})

function accountPage(page: number, pageSize = 20, total = 45) {
  return {
    available: 100,
    held: 0,
    creditName: '积分',
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    ledger: Array.from(
      { length: Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) },
      (_, index) => ({
        id: (page - 1) * pageSize + index + 1,
        kind: 'adjustment',
        availableDelta: 100,
        heldDelta: 0,
        availableAfter: 100,
        heldAfter: 0,
        taskId: '',
        note: `page-${page}-record-${index}`,
        createdAt: '2026-10-20T00:00:00Z',
      }),
    ),
  }
}

it('loads server pages, respects the last page and preserves the current page when refreshing', async () => {
  vi.mocked(frontendRequest).mockImplementation(async (path) => {
    const query = new URL(path, 'http://localhost').searchParams
    return accountPage(Number(query.get('page')), Number(query.get('pageSize'))) as never
  })
  await act(async () => root.render(<Page />))
  expect(container.querySelector('h2')?.textContent).toBe('流水记录')
  expect(frontendRequest).toHaveBeenLastCalledWith('account?page=1&pageSize=20', expect.anything())
  expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
  const previous = () =>
    container.querySelector<HTMLButtonElement>('[aria-label="上一页流水记录"]')!
  const next = () => container.querySelector<HTMLButtonElement>('[aria-label="下一页流水记录"]')!
  expect(previous().disabled).toBe(true)
  await act(async () => next().click())
  expect(container.textContent).toContain('第 21–40 条，共 45 条')
  expect(container.textContent).not.toContain('page-1-record')
  expect(previous().disabled).toBe(false)
  await act(async () => next().click())
  expect(container.querySelectorAll('tbody tr')).toHaveLength(5)
  expect(next().disabled).toBe(true)
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('刷新余额'))!
      .click(),
  )
  expect(frontendRequest).toHaveBeenLastCalledWith('account?page=3&pageSize=20', expect.anything())
  await act(async () => previous().click())
  expect(frontendRequest).toHaveBeenLastCalledWith('account?page=2&pageSize=20', expect.anything())
})

it('returns to page one when changing the page size and disables paging during a request', async () => {
  vi.mocked(frontendRequest).mockResolvedValueOnce(accountPage(3) as never)
  let finish!: (value: unknown) => void
  vi.mocked(frontendRequest).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await act(async () => root.render(<Page />))
  const select = container.querySelector<HTMLSelectElement>('select')!
  await act(async () => {
    select.value = '50'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(frontendRequest).toHaveBeenLastCalledWith('account?page=1&pageSize=50', expect.anything())
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="上一页流水记录"]')?.disabled,
  ).toBe(true)
  expect(container.textContent).toContain('第 3 / 3 页')
  await act(async () => finish(accountPage(1, 50)))
  expect(container.querySelectorAll('tbody tr')).toHaveLength(45)
  expect(container.textContent).toContain('第 1 / 1 页')
  expect(select.value).toBe('50')
})

it('keeps the previous page correctly labelled on errors and handles an empty ledger', async () => {
  vi.mocked(frontendRequest)
    .mockResolvedValueOnce(accountPage(1) as never)
    .mockRejectedValueOnce(new Error('网络中断'))
  await act(async () => root.render(<Page />))
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="下一页流水记录"]')!.click(),
  )
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('网络中断')
  expect(container.textContent).toContain('第 1 / 3 页')
  expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
  vi.mocked(frontendRequest).mockResolvedValueOnce(accountPage(1, 20, 0) as never)
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('刷新余额'))!
      .click(),
  )
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
  expect(container.textContent).toContain('第 0–0 条，共 0 条')
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="下一页流水记录"]')?.disabled,
  ).toBe(true)
})
