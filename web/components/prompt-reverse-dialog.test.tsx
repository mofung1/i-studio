// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PromptReverseDialog } from './prompt-reverse-dialog'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({ account: { authenticated: true, user: { id: 'member' } } }),
}))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  })
  localStorage.setItem('istudio-access-token', 'frontend-session')
  localStorage.setItem('istudio-admin-token', 'separate-admin-session')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

it('loads frontend reverse capabilities and history with the frontend session only', async () => {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer frontend-session')
    const path = new URL(url).pathname
    if (path === '/v1/prompts/reverse/capabilities')
      return new Response(JSON.stringify({ available: true, reason: '', imageDetail: 'high' }))
    if (path === '/v1/prompts/reverse') return new Response(JSON.stringify({ tasks: [] }))
    throw new Error(`unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(<PromptReverseDialog open request={{ revision: 1 }} onClose={() => {}} />),
  )
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('.reverse-analyze')?.textContent).toContain('开始反推')
  expect(container.textContent).not.toContain('后台管理员')
})

it('shows a user-facing unavailable message without asking for administrator login', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            new URL(url).pathname.endsWith('/capabilities')
              ? {
                  available: false,
                  reason: '图片反推服务暂不可用，请联系网站管理员',
                  imageDetail: 'auto',
                }
              : { tasks: [] },
          ),
        ),
    ),
  )
  await act(async () =>
    root.render(<PromptReverseDialog open request={{ revision: 1 }} onClose={() => {}} />),
  )
  expect(container.querySelector('.reverse-provider')?.textContent).toBe(
    '图片反推服务暂不可用，请联系网站管理员',
  )
  expect(container.querySelector<HTMLButtonElement>('.reverse-analyze')?.disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')).toBeNull()
})
