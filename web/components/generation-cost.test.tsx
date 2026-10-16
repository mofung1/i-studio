// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GenerationCost, useGenerationCost } from './generation-cost'

const session = vi.hoisted(() => ({ authenticated: true, available: 2000, loading: false }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({ account: { ...session, user: { id: 'member' } }, loading: session.loading }),
}))

let root: Root
let container: HTMLDivElement
const fetcher = vi.fn<typeof fetch>()
function Harness({ modelId = '', count = 1 }: { modelId?: string; count?: number }) {
  return <GenerationCost {...useGenerationCost(modelId, count)} />
}
function quote(modelId: string, totalMinor = 125) {
  return new Response(
    JSON.stringify({
      modelId,
      quantity: 1,
      unitPriceMinor: totalMinor,
      totalMinor,
      canAfford: true,
      availableMinor: 2000,
      heldMinor: 0,
      creditName: '积分',
      creditScale: 100,
    }),
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
  localStorage.setItem('istudio-access-token', 'member-token')
  session.authenticated = true
  session.available = 2000
  session.loading = false
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function render(modelId = '', count = 1) {
  await act(async () => root.render(<Harness modelId={modelId} count={count} />))
}
async function advance(milliseconds = 150) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

it('does not show a calculation or request a quote without a model or valid count', async () => {
  await render()
  await advance(1000)
  expect(container.textContent).toContain('选择可用模型后显示费用')
  expect(container.textContent).not.toContain('正在计算费用')
  await render('model-a', 0)
  expect(container.textContent).toContain('请选择 1–16 张图片')
  expect(fetcher).not.toHaveBeenCalled()
})

it('shows pending only while quoting, including valid zero-cost models', async () => {
  fetcher.mockResolvedValueOnce(quote('model-a', 0))
  await render('model-a')
  expect(container.textContent).toContain('正在计算费用')
  await advance()
  expect(container.textContent).toContain('0 积分')
  expect(container.textContent).not.toContain('正在计算费用')
})

it('ignores an older model response after switching models', async () => {
  let first!: (value: Response) => void
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        first = resolve
      }),
  )
  fetcher.mockResolvedValueOnce(quote('model-b', 350))
  await render('model-a')
  await advance()
  await render('model-b')
  expect((fetcher.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(true)
  await advance()
  expect(container.textContent).toContain('3.5 积分')
  await act(async () => first(quote('model-a', 999)))
  expect(container.textContent).not.toContain('9.99')
})

it('shows quote failures and allows recalculation', async () => {
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: '所选模型已停用，请重新选择' }), { status: 409 }),
  )
  fetcher.mockResolvedValueOnce(quote('model-a'))
  await render('model-a')
  await advance()
  expect(container.textContent).toContain('所选模型已停用')
  expect(container.textContent).not.toContain('正在计算费用')
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
  await advance()
  expect(container.textContent).toContain('1.25 积分')
})

it('stops waiting after the quote deadline and exposes retry', async () => {
  fetcher.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
  )
  await render('model-a')
  await advance()
  await advance(10_000)
  expect(container.textContent).toContain('费用计算超时')
  expect(container.textContent).not.toContain('正在计算费用')
  expect(container.querySelector('button')?.textContent).toBe('重新计算')
})

it('does not show a pending quote or balance after logout', async () => {
  let finish!: (value: Response) => void
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await render('model-a')
  await advance()
  session.authenticated = false
  localStorage.removeItem('istudio-access-token')
  await render('model-a')
  await act(async () => finish(quote('model-a', 999)))
  expect(container.textContent).toContain('登录后查看余额与费用')
  expect(container.textContent).not.toContain('9.99')
})
