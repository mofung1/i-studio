// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoginForm } from './login-form'
import { LoginForm as AdminLoginForm } from './admin/login-form'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <button>主题</button> }))

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

it('lets users reveal and hide the password without submitting or changing autofill', async () => {
  await act(async () => root.render(<LoginForm />))
  const input = container.querySelector<HTMLInputElement>('input[name="password"]')!
  const toggle = container.querySelector<HTMLButtonElement>('.auth-password-toggle')!
  expect(input.type).toBe('password')
  expect(input.autocomplete).toBe('current-password')
  expect(input.minLength).toBe(8)
  expect(input.placeholder).toBe('8–128 位')
  expect(input.labels?.[0]?.textContent).toBe('密码')
  expect(toggle.type).toBe('button')
  expect(toggle.getAttribute('aria-label')).toBe('显示密码')
  expect(toggle.getAttribute('aria-pressed')).toBe('false')

  await act(async () => toggle.click())
  expect(input.type).toBe('text')
  expect(input.autocomplete).toBe('current-password')
  expect(toggle.getAttribute('aria-label')).toBe('隐藏密码')
  expect(toggle.getAttribute('aria-pressed')).toBe('true')

  await act(async () => toggle.click())
  expect(input.type).toBe('password')
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0]?.[0]).toContain('/v1/operation-settings')
})

it('hides the password again when switching to registration and preserves new-password autofill', async () => {
  await act(async () => root.render(<LoginForm />))
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.auth-password-toggle')!.click(),
  )
  await act(async () => container.querySelector<HTMLButtonElement>('.auth-switch')!.click())
  const input = container.querySelector<HTMLInputElement>('input[name="password"]')!
  expect(input.type).toBe('password')
  expect(input.autocomplete).toBe('new-password')
  expect(input.minLength).toBe(8)
  expect(container.querySelector('.auth-password-toggle')?.getAttribute('aria-pressed')).toBe(
    'false',
  )
})

it('allows six-character admin passwords and has no reveal control', async () => {
  await act(async () => root.render(<AdminLoginForm />))
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
