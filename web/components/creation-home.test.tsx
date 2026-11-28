// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { readHomeComposerDraft, writeHomeComposerDraft } from '@/lib/home-composer'

import { CreationHome } from './creation-home'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/login-link', () => ({
  LoginLink: ({
    returnTo,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { returnTo?: string }) => (
    <a href={`/login?next=${encodeURIComponent(returnTo ?? '/home')}`} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({ account: { authenticated: false }, loading: false }),
}))
vi.mock('@/components/canvas/use-canvas-capabilities', () => {
  const imageEndpoints = [
    {
      id: 'endpoint-1',
      name: '通用生图模型',
      model: 'model-1',
      capabilities: {
        referenceImages: true,
        aspectRatios: ['1:1', '3:4'],
        resolutions: ['2K', '4K'],
      },
    },
  ]
  return { useCanvasCapabilities: () => ({ imageEndpoints, loading: false, error: '' }) }
})
vi.mock('@/components/generation-cost', () => ({
  useGenerationCost: () => ({
    quote: null,
    pending: false,
    error: '',
    authenticated: false,
  }),
}))
vi.mock('@/components/workbench/use-inspiration-prompts', () => ({
  useInspirationPrompts: () => ({
    prompts: [],
    categories: [],
    category: '',
    isLoading: false,
    error: '',
    changeCategory: () => {},
    reload: () => {},
  }),
}))
vi.mock('@/components/select', () => ({
  Select: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

let root: Root | undefined
let container: HTMLDivElement | undefined

async function mount() {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<CreationHome />)
  })
}

async function unmount() {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  root = undefined
  container = undefined
}

function modeButton(label: string) {
  const match = [...container!.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  )
  if (!match) throw new Error(`未找到「${label}」按钮`)
  return match
}

async function type(value: string) {
  const field = container!.querySelector('textarea')!
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.push.mockReset()
  window.sessionStorage.clear()
})

afterEach(async () => {
  await unmount()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('keeps the prompt and mode for a remount after a login redirect', async () => {
  await mount()
  await act(async () => modeButton('图生图').click())
  await type('登录前写好的画面')

  expect(readHomeComposerDraft()).toMatchObject({
    prompt: '登录前写好的画面',
    mode: 'img2img',
  })

  await unmount()
  await mount()

  expect(container!.querySelector('textarea')!.value).toBe('登录前写好的画面')
  expect(modeButton('图生图').getAttribute('aria-pressed')).toBe('true')
})

it('restores a saved draft and forwards it to the studio on submit', async () => {
  writeHomeComposerDraft({
    prompt: '恢复后的描述',
    mode: 'text',
    endpointId: 'endpoint-1',
    aspectRatio: '3:4',
    resolution: '4K',
  })
  await mount()

  expect(container!.querySelector('textarea')!.value).toBe('恢复后的描述')
  await act(async () => {
    container!
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  const target = mocks.push.mock.calls[0]?.[0]
  expect(typeof target).toBe('string')
  const url = new URL(target as string, 'https://istudio.test')
  expect(url.pathname).toBe('/studio')
  expect(url.searchParams.get('mode')).toBe('general')
  expect(url.searchParams.get('prompt')).toBe('恢复后的描述')
  expect(url.searchParams.get('model')).toBe('model-1')
  expect(url.searchParams.get('aspectRatio')).toBe('3:4')
  expect(url.searchParams.get('resolution')).toBe('4K')
  expect(url.searchParams.get('count')).toBe('1')
  expect(readHomeComposerDraft()).toBeNull()
})
