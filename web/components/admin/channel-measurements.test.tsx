// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ChannelMeasurements } from './channel-measurements'
import { adminRequest } from '@/lib/admin'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn() }))

it('loads measurements only when opened and records supplier cost without another generation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const item = {
    id: 'measurement-1',
    endpointId: 'endpoint',
    model: 'image-model',
    aspectRatio: '1:1',
    resolution: '2K',
    width: 1254,
    height: 1254,
    elapsedMs: 12345,
    success: true,
    errorMessage: '',
    estimatedCostMicros: null,
    actualCostMicros: null,
    currency: 'CNY',
    costNote: '',
    createdAt: '2026-10-22T00:00:00Z',
  }
  vi.mocked(adminRequest).mockImplementation(async (path, method, body) =>
    method === 'PUT' ? { ...item, ...(body as object) } : { measurements: [item] },
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () =>
      root.render(<ChannelMeasurements endpointId="endpoint" model="image-model" revision={0} />),
    )
    expect(adminRequest).not.toHaveBeenCalled()
    await act(async () => {
      const details = container.querySelector('details')!
      details.open = true
      details.dispatchEvent(new Event('toggle'))
    })
    expect(container.textContent).toContain('实际 1254 × 1254 px')
    expect(container.textContent).toContain('账单录入：未知')
    await act(async () => container.querySelector('button')!.click())
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('[aria-label="供应商账单费用"]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '0.090001',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === '保存费用记录')!
        .click(),
    )
    expect(adminRequest).toHaveBeenCalledWith('image-measurements/measurement-1', 'PUT', {
      estimatedCostMicros: null,
      actualCostMicros: 90001,
      currency: 'CNY',
      costNote: '',
    })
    expect(container.textContent).toContain('账单录入：0.090001 CNY')
    expect(vi.mocked(adminRequest).mock.calls.some(([path]) => path.includes('/test'))).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  }
})
