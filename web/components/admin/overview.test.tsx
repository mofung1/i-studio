// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AdminOverview } from './overview'

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
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('告警阈值')
    expect(container.textContent).toContain('该提醒不表示真实 API 费用')
    await act(async () => root.render(<AdminOverview unit="积分" overview={{}} />))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
