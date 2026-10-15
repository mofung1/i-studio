// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { settingsRequest } from './ai-settings'
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})
it('selects administrator credentials only for management requests', async () => {
  localStorage.setItem('istudio-access-token', 'customer')
  localStorage.setItem('istudio-admin-token', 'operator')
  const fetcher = vi.fn().mockImplementation(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  await settingsRequest('account')
  await settingsRequest('ai-endpoints')
  await settingsRequest('admin/storage')
  expect(
    fetcher.mock.calls.map(([url, init]) => [new URL(url).pathname, init.headers.Authorization]),
  ).toEqual([
    ['/v1/account', 'Bearer customer'],
    ['/v1/admin/ai-endpoints', 'Bearer operator'],
    ['/v1/admin/storage', 'Bearer operator'],
  ])
})
