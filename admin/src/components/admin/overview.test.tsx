// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AdminOverview } from './overview'

vi.mock('@/routing/link', () => ({ default: 'a' }))
vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn(() => new Promise(() => {})) }))

async function withOverview(
  overview: Record<string, number>,
  check: (container: HTMLDivElement) => void,
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<AdminOverview unit="积分" overview={overview} />))
    check(container)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
}

it('shows actionable usage alerts while keeping credits distinct from the supplier bill', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () =>
      root.render(
        <AdminOverview
          unit="积分"
          overview={{
            todayCharged: 10000,
            dailyCreditAlertMinor: 10000,
            signupGiftDailyBudgetMinor: 1000,
            signupGiftToday: 800,
            auxiliaryDailyLimit: 10,
            auxiliaryToday: 8,
            storageFullAccounts: 1,
          }}
        />,
      ),
    )
    expect(container.querySelector('[aria-label="需要关注"]')?.textContent).toContain('告警阈值')
    expect(container.textContent).toContain('该提醒不表示真实 API 费用')
    await act(async () => root.render(<AdminOverview unit="积分" overview={{}} />))
    expect(container.querySelector('[aria-label="需要关注"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})

it('keeps missing metrics unknown instead of inventing usage or available budgets', async () => {
  await withOverview({}, (container) => {
    const metrics = container.querySelector('[aria-label="今日运营数据"]')!
    expect([...metrics.querySelectorAll('dd > span')].map((item) => item.textContent)).toEqual([
      '—',
      '—',
      '—',
      '—',
    ])
    expect(container.querySelectorAll('progress')).toHaveLength(0)
    expect(container.textContent).not.toContain('1000')
    expect(container.textContent).not.toContain('全部正常')
  })
})

it('shows actual quota usage without losing an exceeded limit or rounding credit amounts', async () => {
  await withOverview(
    {
      auxiliaryToday: 12,
      auxiliaryDailyLimit: 10,
      auxiliaryActive: 2,
      auxiliaryConcurrentLimit: 4,
      signupGiftToday: 1234,
      signupGiftDailyBudgetMinor: 10000,
    },
    (container) => {
      const auxiliary =
        container.querySelector<HTMLProgressElement>('[aria-label="辅助请求额度使用"]')!
      expect(auxiliary.value).toBe(10)
      expect(auxiliary.max).toBe(10)
      expect(container.textContent).toContain('已使用 120%')
      expect(container.textContent).toContain('12.34 / 100 积分')
      expect(container.textContent).toContain('当前并发 2 / 4')
    },
  )
})

it('keeps first-time setup secondary and links daily tasks to their management pages', async () => {
  await withOverview(
    { todayTasks: 30, activeTasks: 2, todayFailed: 1, todayCharged: 1250 },
    (container) => {
      expect(container.querySelector('details')?.open).toBe(false)
      expect(container.querySelector('details')?.textContent).toContain('首次配置与检查')
      expect(container.querySelector('a[href="/admin/submissions"]')?.textContent).toContain(
        '审核用户投稿',
      )
      expect(container.querySelector('a[href="/admin/feedback"]')?.textContent).toContain(
        '处理用户反馈',
      )
      const metrics = container.querySelector('[aria-label="今日运营数据"]')!
      expect(metrics.querySelectorAll('dd')).toHaveLength(4)
      expect(metrics.textContent).toContain('12.5')
    },
  )
})
