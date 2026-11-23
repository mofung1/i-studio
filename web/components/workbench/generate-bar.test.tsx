// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GenerateBar } from './generate-bar'

vi.mock('../account-provider', () => ({
  useAccount: () => ({ account: { authenticated: true }, loading: false }),
}))
vi.mock('../generation-cost', () => ({
  useGenerationCost: () => ({ authenticated: true, quote: { canAfford: true } }),
  GenerationCost: () => null,
}))

it('blocks generation for incompatible parameters even with sufficient credits', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  const submit = vi.fn()
  const props = {
    title: '图片',
    expectedCount: 1,
    aspectRatio: '16:9',
    resolution: '4K',
    notice: null,
    isSubmitting: false,
    isGenerating: false,
    aiEnabled: true,
    onSubmit: submit,
  }
  try {
    await act(async () =>
      root.render(<GenerateBar {...props} disabledReason="当前模型不支持所选比例" />),
    )
    const button = container.querySelector<HTMLButtonElement>('.generate-button')!
    expect(button.disabled).toBe(true)
    expect(button.title).toContain('不支持所选比例')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '当前模型不支持所选比例',
    )
    await act(async () => button.click())
    expect(submit).not.toHaveBeenCalled()
    await act(async () => root.render(<GenerateBar {...props} />))
    expect(button.disabled).toBe(false)
    await act(async () => button.click())
    expect(submit).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})

it('keeps the empty product selection disabled without masking submission errors', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  const props = {
    title: '商品主图',
    expectedCount: 3,
    aspectRatio: '1:1',
    resolution: '2K',
    isSubmitting: false,
    isGenerating: false,
    aiEnabled: true,
    onSubmit: vi.fn(),
    needsProductImage: true,
  }
  try {
    await act(async () => root.render(<GenerateBar {...props} notice={null} />))
    expect(container.querySelector<HTMLButtonElement>('.generate-button')?.disabled).toBe(true)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    const message = '模型价格已变更，请确认最新费用后重新提交'
    await act(async () =>
      root.render(<GenerateBar {...props} notice={{ kind: 'error', message }} />),
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
