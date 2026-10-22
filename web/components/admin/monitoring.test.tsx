// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminRequest, type OperationalMonitoring } from '@/lib/admin'
import { AdminMonitoring } from './monitoring'

vi.mock('@/lib/admin', async (original) => ({
  ...(await original<object>()),
  adminRequest: vi.fn(),
}))
const request = vi.mocked(adminRequest)
const healthy: OperationalMonitoring = {
  checkedAt: '2026-10-22T02:00:00Z',
  queueWaitSeconds: 300,
  leaseGraceSeconds: 60,
  generationQueued: 0,
  reverseQueued: 0,
  generationOverdue: 0,
  reverseOverdue: 0,
  oldestGenerationWaitSeconds: 0,
  oldestReverseWaitSeconds: 0,
  expiredGenerationLeases: 0,
  expiredReverseRuns: 0,
  terminalReservations: 0,
  agedReservations: 0,
  heldMismatchAccounts: 0,
  storageFailures24h: 0,
  deletionRetryPending: 0,
  deletionRetryRepeated: 0,
  storageMonitoringDropped: 0,
  issues: [],
  storageFailures: [],
}
let root: Root
let container: HTMLDivElement
let visibility: 'visible' | 'hidden'
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  request.mockReset().mockResolvedValue(healthy)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const render = () => act(async () => root.render(<AdminMonitoring unit="积分" />))
const refresh = () =>
  act(async () => (container.querySelector('button') as HTMLButtonElement).click())

it('does not show healthy state when the first monitor read fails', async () => {
  request.mockRejectedValue(new Error('监控不可用'))
  await render()
  expect(container.textContent).toContain('当前状态无法确认')
  expect(container.textContent).not.toContain('未见异常')
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('监控不可用')
})

it('explains a browser network failure in Chinese', async () => {
  request.mockRejectedValue(new TypeError('Failed to fetch'))
  await render()
  expect(container.textContent).toContain('无法连接监控服务')
  expect(container.textContent).not.toContain('Failed to fetch')
  expect(container.textContent).not.toContain('未见异常')
})

it('shows actionable issues, exact credit amounts and redacted storage diagnostics', async () => {
  request.mockResolvedValue({
    ...healthy,
    generationQueued: 3,
    generationOverdue: 1,
    oldestGenerationWaitSeconds: 480,
    terminalReservations: 1,
    heldMismatchAccounts: 1,
    storageFailures24h: 1,
    storageMonitoringDropped: 2,
    issues: [
      {
        kind: 'held_mismatch',
        id: 'account-fixture',
        status: 'account',
        ageSeconds: 0,
        heldMinor: 1234,
        expectedHeldMinor: 1000,
      },
    ],
    storageFailures: [
      {
        id: 'diagnostic-fixture',
        operation: 'save',
        backend: 'cloud',
        objectReference: 'opaque-digest',
        createdAt: healthy.checkedAt,
      },
    ],
  })
  await render()
  expect(container.textContent).toContain('最久 8 分 0 秒')
  expect(container.textContent).toContain('账户 12.34 / 应预留 10 积分')
  expect(container.textContent).toContain('diagnostic-fixture')
  expect(container.textContent).toContain('有 2 次失败事件未能入库')
  expect(container.textContent).toContain('不自动退款')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]?.slice(0, 3)).toEqual(['monitoring', 'GET', undefined])
})

it('keeps the last snapshot with an explicit stale warning and recovers on refresh', async () => {
  await render()
  request.mockRejectedValueOnce(new Error('连接中断'))
  await refresh()
  expect(container.textContent).toContain('上次成功快照')
  expect(container.textContent).toContain('快照时间')
  await refresh()
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('polls only while visible and resumes when returning to the page', async () => {
  await render()
  await act(async () => vi.advanceTimersByTimeAsync(30000))
  expect(request).toHaveBeenCalledTimes(2)
  visibility = 'hidden'
  await act(async () => vi.advanceTimersByTimeAsync(60000))
  expect(request).toHaveBeenCalledTimes(2)
  visibility = 'visible'
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  expect(request).toHaveBeenCalledTimes(3)
})

it('does not overlap slow requests and aborts them on leaving the page', async () => {
  let signal: AbortSignal | undefined
  request.mockImplementation((_path, _method, _body, passedSignal) => {
    signal = passedSignal
    return new Promise(() => {})
  })
  await render()
  await refresh()
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => root.render(<p>Other page</p>))
  expect(signal?.aborted).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(60000))
  expect(request).toHaveBeenCalledTimes(1)
})

it('ends a timed out read without inventing a successful monitor snapshot', async () => {
  request.mockImplementation(
    (_path, _method, _body, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  )
  await render()
  await act(async () => vi.advanceTimersByTimeAsync(10000))
  expect(container.textContent).toContain('监控请求超时')
  expect(container.textContent).not.toContain('未见异常')
  expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(false)
})
