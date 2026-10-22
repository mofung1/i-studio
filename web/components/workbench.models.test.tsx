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
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
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

it.each([
  ['general', 'product-main', 'prompt', 'AI 优化'],
  ['commerce', 'product-main', 'requirements', 'AI 帮写'],
  ['commerce', 'detail-page', 'requirements', 'AI 帮写'],
  ['commerce', 'viral-recreate', 'requirements', 'AI 帮写'],
  ['commerce', 'product-retouch', 'requirements', 'AI 帮写'],
] as const)(
  'optimizes %s/%s through the configured AI and can undo the result',
  async (mode, task, target, label) => {
    let submitted: FormData | null = null
    fetcher.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/capabilities'))
        return new Response(
          JSON.stringify({
            aiEnabled: true,
            promptEnhanceEnabled: true,
            promptVision: false,
            imageEndpoints: [{ id: 'a', name: '模型 A', model: 'A', isDefault: true }],
          }),
        )
      if (path.endsWith('/prompts/enhance')) {
        submitted = init?.body as FormData
        return new Response(
          JSON.stringify({
            text: '保留商品外形，完善构图与柔光，保持原有包装文字。',
            model: 'fixture-prompt',
          }),
        )
      }
      if (path.endsWith('/quote')) return quoteResponse()
      throw new Error(`Unexpected request: ${url}`)
    })
    await act(async () => root.render(<Workbench initialMode={mode} initialTask={task} />))
    const input = container.querySelector<HTMLTextAreaElement>('.prompt-input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '保留商品外形，不新增文字',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === label,
    )!
    expect(button).toBeDefined()
    await act(async () => button.click())
    expect(submitted).not.toBeNull()
    expect(submitted!.get('target')).toBe(target)
    expect(submitted!.get('taskType')).toBe(mode === 'general' ? null : task)
    expect(submitted!.get('text')).toBe('保留商品外形，不新增文字')
    expect(input.value).toContain('完善构图与柔光')
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === '撤销')!
        .click(),
    )
    expect(input.value).toBe('保留商品外形，不新增文字')
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/generation/tasks'))).toBe(
      false,
    )
  },
)

function quoteResponse() {
  return new Response(
    JSON.stringify({
      modelId: 'a',
      unitPriceMinor: 100,
      totalMinor: 100,
      quantity: 1,
      availableMinor: 5000,
      heldMinor: 0,
      canAfford: true,
      creditName: '积分',
      creditScale: 100,
    }),
  )
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
