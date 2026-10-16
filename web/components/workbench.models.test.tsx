// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Workbench } from './workbench'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/workbench',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: true,
      user: { id: 'member' },
      available: 5000,
      held: 0,
      creditName: '积分',
    },
    loading: false,
  }),
}))
vi.mock('./prompt-reverse-provider', () => ({ usePromptReverse: () => ({ openReverse: vi.fn() }) }))
vi.mock('./workbench/workbench-rail', () => ({ WorkbenchRail: () => null }))
vi.mock('./workbench/workbench-header', () => ({ WorkbenchHeader: () => null }))
vi.mock('./workbench/result-workspace', () => ({ ResultWorkspace: () => null }))
vi.mock('./workbench/creation-library-tools', () => ({ CreationLibraryTools: () => null }))
vi.mock('./workbench/use-workbench-handoff', async (original) => ({
  ...(await original<object>()),
  useWorkbenchHandoff: () => {},
}))
vi.mock('./workbench/use-reverse-prompt-handoff', () => ({ useReversePromptHandoff: () => {} }))
vi.mock('./workbench/use-personal-prompt-handoff', () => ({ usePersonalPromptHandoff: () => {} }))
vi.mock('./workbench/use-generation-task', () => ({
  useGenerationTask: () => ({
    generationTask: null,
    resultHistory: [],
    activeResultIndex: 0,
    activeResult: null,
    isSubmitting: false,
    isGenerating: false,
    notice: null,
    setNotice: vi.fn(),
    setActiveResultIndex: vi.fn(),
    submit: vi.fn(),
    removeResult: vi.fn(),
  }),
}))

let container: HTMLDivElement
let root: Root
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  localStorage.setItem('istudio-access-token', 'member-token')
  fetcher.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const modelTrigger = () => container.querySelector<HTMLButtonElement>('[aria-label="模型选择"]')!
async function waitForQuote() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150)
  })
}

it('reloads enabled models after an empty list and recalculates cost for the selected model', async () => {
  let enabled = false
  fetcher.mockImplementation(async (url) => {
    const parsed = new URL(String(url))
    if (parsed.pathname.endsWith('/capabilities'))
      return new Response(
        JSON.stringify({
          aiEnabled: enabled,
          imageEndpoints: enabled
            ? [
                { id: 'a', name: '模型 A', model: 'A', isDefault: true },
                { id: 'b', name: '模型 B', model: 'B' },
              ]
            : [],
        }),
      )
    if (parsed.pathname.endsWith('/quote')) {
      const id = parsed.searchParams.get('modelId')
      const price = id === 'a' ? 100 : 250
      return new Response(
        JSON.stringify({
          modelId: id,
          unitPriceMinor: price,
          totalMinor: price,
          canAfford: true,
          availableMinor: 5000,
          creditName: '积分',
        }),
      )
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  await act(async () => root.render(<Workbench initialMode="general" initialTask="product-main" />))
  expect(modelTrigger().disabled).toBe(true)
  expect(container.textContent).toContain('暂无可用模型')
  expect(container.textContent).not.toContain('正在计算费用')
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/quote'))).toHaveLength(0)
  enabled = true
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="重新加载模型列表"]')!.click(),
  )
  await waitForQuote()
  expect(modelTrigger().textContent).toContain('模型 A')
  expect(container.textContent).toContain('1 积分')
  await act(async () =>
    modelTrigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((element) => element.textContent === '模型 B')!
      .click(),
  )
  await waitForQuote()
  expect(modelTrigger().textContent).toContain('模型 B')
  expect(container.textContent).toContain('2.5 积分')
})

it('reports a failed model request instead of silently presenting an empty selector', async () => {
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ message: '模型服务暂不可用' }), { status: 503 }),
  )
  await act(async () => root.render(<Workbench initialMode="general" initialTask="product-main" />))
  expect(modelTrigger().disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('模型服务暂不可用')
  expect(container.textContent).not.toContain('正在计算费用')
})
