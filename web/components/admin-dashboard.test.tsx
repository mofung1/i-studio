// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminRequest } from '@/lib/admin'
import { AdminDashboard } from './admin-dashboard'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn() }))
vi.mock('./library-controls', async (original) => ({
  ...(await original<object>()),
  LibrarySelect: ({
    label,
    value,
    options,
    disabled,
    onChange,
  }: {
    label: string
    value: string
    options: Array<[string, string]>
    disabled?: boolean
    onChange: (value: string) => void
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([id, title]) => (
        <option key={id} value={id}>
          {title}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('./account-provider', () => ({
  useAdminAccount: () => ({ account: { creditName: '创作币' }, refresh: vi.fn() }),
}))
vi.mock('@/lib/credits', async (original) => ({
  ...(await original<object>()),
  refreshAccount: vi.fn(),
}))

let root: Root
let container: HTMLDivElement
const request = vi.mocked(adminRequest)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  request.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function button(text: string) {
  const match = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  )
  if (!match) throw new Error(`未找到按钮：${text}`)
  return match
}

async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

it('keeps balance retries idempotent and starts a new adjustment after editing', async () => {
  const member = {
    id: 'member',
    username: 'alice',
    role: 'user',
    status: 'active',
    available: 100,
    held: 0,
  }
  const submissions: Array<{ requestKey: string; deltaMinor: number; note: string }> = []
  request.mockImplementation(async (path, method, body) => {
    if (path.startsWith('users?')) return { users: [member] }
    if (method === 'POST' && path === 'users/member/balance') {
      submissions.push(body as (typeof submissions)[number])
      if (submissions.length < 3) throw new Error('连接中断，请重试')
      return { saved: true }
    }
    throw new Error(`unexpected request: ${method} ${path}`)
  })
  await act(async () => root.render(<AdminDashboard view="users" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  await act(async () => button('调整余额').click())
  const editor = () => container.querySelector<HTMLElement>('[aria-label="调整用户余额"]')!
  const inputs = editor().querySelectorAll('input')
  await change(inputs[0]!, '2.50')
  await change(inputs[1]!, '测试发放')
  await submit(editor().querySelector('form')!)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('连接中断')
  await submit(editor().querySelector('form')!)
  expect(submissions[0]!.requestKey).toBeTruthy()
  expect(submissions[1]).toEqual(submissions[0])
  await change(editor().querySelector('input')!, '3.25')
  await submit(editor().querySelector('form')!)
  expect(submissions[2]!.requestKey).not.toBe(submissions[0]!.requestKey)
  expect(submissions[2]).toMatchObject({ deltaMinor: 325, note: '测试发放' })
  expect(editor()).toBeNull()
})

it('submits precise model pricing and clears the default flag when taking it off sale', async () => {
  const model = {
    id: 'model-1',
    name: '测试模型',
    endpointId: 'endpoint-1',
    priceMinor: 125,
    enabled: true,
    isDefault: true,
  }
  request.mockImplementation(async (path) => {
    if (path === 'models') return { models: [model] }
    if (path === 'ai-endpoints')
      return { endpoints: [{ id: 'endpoint-1', name: '通道', purpose: 'image', enabled: true }] }
    return { id: 'model-1' }
  })
  await act(async () => root.render(<AdminDashboard view="models" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  await act(async () => button('编辑').click())
  const editor = container.querySelector<HTMLElement>('[aria-label="编辑前台模型"]')!
  await change(editor.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!, '2.35')
  await act(async () => editor.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  const defaultCheckbox = editor.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!
  expect(defaultCheckbox.checked).toBe(false)
  expect(defaultCheckbox.disabled).toBe(true)
  await submit(editor.querySelector('form')!)
  expect(request).toHaveBeenCalledWith('models/model-1', 'PUT', {
    ...model,
    priceMinor: 235,
    enabled: false,
    isDefault: false,
  })
  expect(container.querySelector('[aria-label="编辑前台模型"]')).toBeNull()
})

it('keeps search focused while loading and ignores an older search response', async () => {
  const pending: Array<(value: unknown) => void> = []
  request.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  await act(async () => root.render(<AdminDashboard view="users" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  const search = container.querySelector<HTMLInputElement>('#member-search')!
  search.focus()
  await change(search, 'alice')
  expect(container.querySelector('#member-search')).toBe(search)
  expect(document.activeElement).toBe(search)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  const user = (username: string) => ({
    id: username,
    username,
    role: 'user',
    status: 'active',
    available: 0,
    held: 0,
  })
  await act(async () => pending[1]!({ users: [user('alice')] }))
  await act(async () => pending[0]!({ users: [user('stale-result')] }))
  expect(container.textContent).toContain('alice')
  expect(container.textContent).not.toContain('stale-result')
})

it('refreshes the dashboard with a single read', async () => {
  request.mockResolvedValue({ users: [] })
  await act(async () => root.render(<AdminDashboard view="users" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  request.mockClear()
  await act(async () => button('刷新').click())
  expect(request).toHaveBeenCalledTimes(1)
})

function taskPage(path: string) {
  const params = new URL(`http://fixture/${path}`).searchParams
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('pageSize'))
  const total = 45
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    tasks: Array.from(
      { length: Math.min(pageSize, total - (page - 1) * pageSize) },
      (_, index) => ({
        id: `task-${(page - 1) * pageSize + index + 1}`,
        username: 'customer',
        modelName: '测试模型',
        status: 'succeeded',
        reserved: 125,
        charged: 125,
        refunded: 0,
        settled: true,
        errorMessage: '',
        createdAt: '2026-10-16T00:00:00Z',
      }),
    ),
  }
}
const nextTaskPage = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="下一页任务"]')!
const previousTaskPage = () =>
  container.querySelector<HTMLButtonElement>('button[aria-label="上一页任务"]')!
async function flushTaskRequest() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

it('requests backend pages and resets to page one when changing page size', async () => {
  request.mockImplementation(async (path) => taskPage(path))
  await act(async () => root.render(<AdminDashboard view="tasks" />))
  await flushTaskRequest()
  expect(request).toHaveBeenLastCalledWith('tasks?page=1&pageSize=20')
  expect(container.textContent).toContain('共 45 条任务 · 第 1 / 3 页')
  expect(previousTaskPage().disabled).toBe(true)
  await act(async () => nextTaskPage().click())
  expect(nextTaskPage().disabled).toBe(true)
  await flushTaskRequest()
  expect(request).toHaveBeenLastCalledWith('tasks?page=2&pageSize=20')
  expect(container.textContent).toContain('task-21')
  expect(container.textContent).not.toContain('task-1')
  const size = container.querySelector<HTMLSelectElement>('select[aria-label="每页任务条数"]')!
  await act(async () => {
    size.value = '50'
    size.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flushTaskRequest()
  expect(request).toHaveBeenLastCalledWith('tasks?page=1&pageSize=50')
  expect(container.textContent).toContain('共 45 条任务 · 第 1 / 1 页')
  expect(nextTaskPage().disabled).toBe(true)
  expect(previousTaskPage().disabled).toBe(true)
})

it('allows retrying a failed page without getting stuck loading', async () => {
  let failed = false
  request.mockImplementation(async (path) => {
    if (path.includes('page=2') && !failed) {
      failed = true
      throw new Error('分页请求失败')
    }
    return taskPage(path)
  })
  await act(async () => root.render(<AdminDashboard view="tasks" />))
  await flushTaskRequest()
  await act(async () => nextTaskPage().click())
  await flushTaskRequest()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('分页请求失败')
  expect(nextTaskPage().disabled).toBe(false)
  await act(async () => nextTaskPage().click())
  await flushTaskRequest()
  expect(container.textContent).toContain('共 45 条任务 · 第 2 / 3 页')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(nextTaskPage().disabled).toBe(false)
})
