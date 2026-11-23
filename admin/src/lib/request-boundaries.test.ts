// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminRequest } from './admin'
import { saveSiteBranding } from './admin-site-settings'

const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  localStorage.setItem('istudio-access-token', 'customer')
  localStorage.setItem('istudio-admin-token', 'operator')
  fetcher.mockReset().mockImplementation(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it.each([
  'account',
  'assets/a/content',
  'generation/tasks',
  'commerce/products',
  'personal/prompts',
  'users/../../account',
  'admin/storage',
])('rejects frontend or accidentally double-prefixed admin paths: %s', async (path) => {
  await expect(adminRequest(path)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})

it('authenticates multipart branding changes with the administrator session', async () => {
  const logo = new File(['image'], 'logo.png', { type: 'image/png' })
  await saveSiteBranding('Studio', logo, false, { mode: 'qrcode', text: '', qr: logo })
  const [url, init] = fetcher.mock.calls[0]!
  expect(new URL(String(url), window.location.origin).pathname).toBe('/v1/admin/site-settings')
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer operator')
  expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
  expect((init?.body as FormData).get('logo')).toBeInstanceOf(File)
  expect((init?.body as FormData).get('contactMode')).toBe('qrcode')
  expect((init?.body as FormData).get('contactQr')).toBeInstanceOf(File)
  await saveSiteBranding('Studio', null, false, {
    mode: 'text',
    text: '  微信：studio  ',
    qr: logo,
  })
  const textBody = fetcher.mock.calls[1]![1]?.body as FormData
  expect(textBody.get('contactText')).toBe('微信：studio')
  expect(textBody.has('contactQr')).toBe(false)
})
