// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'

vi.mock('@/routing/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/theme-switch', () => ({ ThemeSwitch: () => <button>主题</button> }))

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ registrationEnabled: true }),
  })
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('allows six-character admin passwords and has no reveal control', async () => {
  await act(async () => root.render(<LoginForm />))
  expect(container.querySelector('form#admin-login')).not.toBeNull()
  const input = container.querySelector<HTMLInputElement>('input[name="admin-password"]')!
  expect(input.type).toBe('password')
  expect(input.autocomplete).toBe('current-password')
  expect(input.minLength).toBe(6)
  expect(input.maxLength).toBe(128)
  expect(input.placeholder).toBe('6–128 位')
  expect(container.querySelector('.auth-password-toggle')).toBeNull()
  expect(container.querySelector('.auth-page-public')).toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})
