// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminRequest } from '@/lib/admin'
import { AdminDashboard } from './admin-dashboard'

vi.mock('@/lib/admin', async (original) => ({
  ...(await original<object>()),
  adminRequest: vi.fn(),
}))
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
function firstPage(key: string, items: unknown[]) {
  return { [key]: items, page: 1, pageSize: 20, total: items.length, totalPages: 1 }
}

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
    if (path.startsWith('users?')) return firstPage('users', [member])
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
    version: 1,
    channels: [
      { endpointId: 'endpoint-1', upstreamModelId: 'upstream', enabled: true, isActive: true },
    ],
    capabilities: { referenceImages: true, aspectRatios: ['1:1'], resolutions: ['1K'] },
    priceMinor: 125,
    enabled: true,
    isDefault: true,
  }
  request.mockImplementation(async (path) => {
    if (path.startsWith('models?')) return firstPage('models', [model])
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
  await act(async () => pending[1]!(firstPage('users', [user('alice')])))
  await act(async () => pending[0]!(firstPage('users', [user('stale-result')])))
  expect(container.textContent).toContain('alice')
  expect(container.textContent).not.toContain('stale-result')
})

it('refreshes the dashboard with a single read', async () => {
  request.mockResolvedValue(firstPage('users', []))
  await act(async () => root.render(<AdminDashboard view="users" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  request.mockClear()
  await act(async () => button('刷新').click())
  expect(request).toHaveBeenCalledTimes(1)
  expect(container.querySelector('.settings-saved')).toBeNull()
  expect(container.textContent).not.toContain('已刷新')
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
  expect(container.textContent).toContain('第 1–20 条，共 45 条任务')
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
  expect(container.textContent).toContain('第 1–45 条，共 45 条任务')
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
  expect(container.textContent).toContain('第 21–40 条，共 45 条任务')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(nextTaskPage().disabled).toBe(false)
})

it.each([
  ['users', '用户'],
  ['audit', '日志'],
  ['models', '模型'],
] as const)(
  'paginates %s and refreshes the current page without a success notice',
  async (view, label) => {
    request.mockImplementation(async (path) => {
      if (path === 'ai-endpoints') return { endpoints: [] }
      const params = new URL(`http://fixture/${path}`).searchParams
      const page = Number(params.get('page'))
      const pageSize = Number(params.get('pageSize'))
      const rows = {
        users: [
          {
            id: `customer-${page}`,
            username: `用户页${page}`,
            role: 'user',
            status: 'active',
            available: 125,
            held: 0,
          },
        ],
        models: [
          {
            id: `model-${page}`,
            name: `模型页${page}`,
            endpointId: 'channel',
            priceMinor: 125,
            enabled: true,
            isDefault: false,
          },
        ],
        audit: [
          {
            id: page,
            actor: `操作人页${page}`,
            action: 'PUT prompt-reverse-settings',
            targetId: '完整对象编号-12345678901234567890',
            detail: '配置已更新',
            createdAt: '2026-10-16T00:00:00Z',
          },
        ],
      }[view]
      return { [view]: rows, page, pageSize, total: 45, totalPages: Math.ceil(45 / pageSize) }
    })
    await act(async () => root.render(<AdminDashboard view={view} />))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    const next = container.querySelector<HTMLButtonElement>(`[aria-label="下一页${label}"]`)!
    await act(async () => next.click())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(
      request.mock.calls.some(([path]) => path.startsWith(`${view}?`) && path.includes('page=2')),
    ).toBe(true)
    expect(container.textContent).toContain('第 2 / 3 页')
    request.mockClear()
    await act(async () => button('刷新').click())
    expect(request.mock.calls.filter(([path]) => path.startsWith(`${view}?`))).toHaveLength(1)
    expect(request.mock.calls.find(([path]) => path.startsWith(`${view}?`))![0]).toContain('page=2')
    expect(container.querySelector('.settings-saved')).toBeNull()
    if (view === 'audit') {
      expect(container.textContent).toContain('保存图片反推配置')
      expect(container.textContent).toContain('完整对象编号-12345678901234567890')
    }
    const size = container.querySelector<HTMLSelectElement>(
      `select[aria-label="每页${label}条数"]`,
    )!
    await act(async () => {
      size.value = '50'
      size.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(container.textContent).toContain('第 1 / 1 页')
    expect(next.disabled).toBe(true)
  },
)

it('returns user search to the first page and resets list scrolling only when paging or searching', async () => {
  request.mockImplementation(async (path) => {
    const page = Number(new URL(`http://fixture/${path}`).searchParams.get('page'))
    return { users: [], page, pageSize: 20, total: 45, totalPages: 3 }
  })
  await act(async () => root.render(<AdminDashboard view="users" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  const scroll = container.querySelector('.admin-data-scroll')!
  scroll.scrollTop = 300
  await act(async () => button('刷新').click())
  expect(scroll.scrollTop).toBe(300)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="下一页用户"]')!.click(),
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  expect(scroll.scrollTop).toBe(0)
  scroll.scrollTop = 200
  await change(container.querySelector<HTMLInputElement>('#member-search')!, 'alice')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  expect(request).toHaveBeenLastCalledWith('users?q=alice&page=1&pageSize=20')
  expect(scroll.scrollTop).toBe(0)
})

it('requests global sorting from the server and preserves it across pagination and refresh', async () => {
  request.mockImplementation(async (path) => taskPage(path))
  await act(async () => root.render(<AdminDashboard view="tasks" />))
  await flushTaskRequest()
  await act(async () => button('实扣').click())
  await flushTaskRequest()
  expect(request).toHaveBeenLastCalledWith('tasks?page=1&pageSize=20&sort=charged&order=asc')
  await act(async () => nextTaskPage().click())
  await flushTaskRequest()
  expect(request).toHaveBeenLastCalledWith('tasks?page=2&pageSize=20&sort=charged&order=asc')
  await act(async () => button('刷新').click())
  expect(request).toHaveBeenLastCalledWith('tasks?page=2&pageSize=20&sort=charged&order=asc')
  expect(container.querySelector('.settings-saved')).toBeNull()
  await act(async () => button('实扣').click())
  await flushTaskRequest()
  expect(request).toHaveBeenLastCalledWith('tasks?page=1&pageSize=20&sort=charged&order=desc')
})

it('saves daily gift budget, usage alert and storage quota without losing decimal precision', async () => {
  const settings = {
    creditName: '积分',
    registrationEnabled: true,
    signupGiftMinor: 0,
    maxConcurrentTasks: 2,
    generationRequestsPerHour: 30,
    auxiliaryRequestsPerHour: 20,
    signupGiftDailyBudgetMinor: 100000,
    dailyCreditAlertMinor: 100000,
    accountStorageLimitBytes: 1073741824,
    platformAuxiliaryConcurrent: 4,
    platformAuxiliaryPerDay: 1000,
  }
  request.mockImplementation(async (path) => (path === 'settings' ? settings : []))
  await act(async () => root.render(<AdminDashboard view="operations" />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  const field = (title: string) =>
    Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent?.includes(title))!
      .querySelector('input')!
  await change(field('每日注册赠送总预算'), '12.34')
  await change(field('每日消耗告警阈值'), '56.78')
  await change(field('每账号存储额度'), '128')
  await submit(container.querySelector('form')!)
  expect(request).toHaveBeenCalledWith(
    'settings',
    'PUT',
    expect.objectContaining({
      signupGiftDailyBudgetMinor: 1234,
      dailyCreditAlertMinor: 5678,
      accountStorageLimitBytes: 134217728,
    }),
  )
})
