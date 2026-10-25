// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Page from './page'
import { readSiteBranding } from '@/lib/site-settings'
import { saveSiteBranding } from '@/lib/admin-site-settings'
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/site-settings', async (original) => ({
  ...(await original<object>()),
  readSiteBranding: vi.fn(),
}))
vi.mock('@/lib/admin-site-settings', () => ({ saveSiteBranding: vi.fn() }))
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(readSiteBranding).mockResolvedValue({ name: 'iStudio', logoPath: '' })
  vi.mocked(saveSiteBranding).mockResolvedValue({ name: '我的工作台', logoPath: '' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('saves the branding form without a browser confirmation or unload interception', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  expect(host.querySelector('h1')?.textContent).toBe('网站配置')
  const input = host.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')!
  expect(input.value).toBe('iStudio')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      '我的工作台',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(saveSiteBranding).toHaveBeenCalledWith('我的工作台', null, false, {
    mode: 'none',
    text: '',
    qr: null,
  })
  expect(refresh).toHaveBeenCalled()
  expect(host.textContent).toContain('网站配置已保存')
  expect(confirm).not.toHaveBeenCalled()
})
