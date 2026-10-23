// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SiteBranding } from '@/lib/site-settings'
import { SiteContact } from './site-contact'

const state = vi.hoisted(() => ({ branding: { name: 'iStudio', logoPath: '' } as SiteBranding }))
vi.mock('./site-branding-provider', () => ({ useSiteBranding: () => state }))
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('shows only the selected contact format, treats text as plain text and hides disabled contact', async () => {
  state.branding = {
    name: 'iStudio',
    logoPath: '',
    contactMode: 'text',
    contactText: '微信：studio\n<b>邮箱：test@example.com</b>',
    contactQrPath: '/v1/site-settings/contact/old.png',
  }
  await act(async () => root.render(<SiteContact />))
  expect(container.textContent).toContain('微信：studio\n<b>邮箱：test@example.com</b>')
  expect(container.querySelector('b, img')).toBeNull()
  state.branding = { ...state.branding, contactMode: 'qrcode' }
  await act(async () => root.render(<SiteContact />))
  expect(container.textContent).not.toContain('微信：studio')
  expect(container.querySelector('img')?.getAttribute('src')).toContain(
    '/v1/site-settings/contact/old.png',
  )
  expect(container.querySelector('img')?.alt).toContain('二维码')
  state.branding = { ...state.branding, contactMode: 'none' }
  await act(async () => root.render(<SiteContact />))
  expect(container.innerHTML).toBe('')
  state.branding = { name: 'old API', logoPath: '' }
  await act(async () => root.render(<SiteContact />))
  expect(container.innerHTML).toBe('')
})
