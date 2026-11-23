// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { frontendRequest, FrontendRequestError } from './frontend-request'
import { libraryRequest } from './library'
import { reverseRequest, ReverseRequestError } from './prompt-reverse'
import { readSiteBranding } from './site-settings'

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

it('uses the user session for every frontend request family', async () => {
  await frontendRequest('account')
  await libraryRequest('personal/prompts', { headers: new Headers({ 'X-Test': 'retained' }) })
  await reverseRequest('prompts/reverse/capabilities')
  expect(
    fetcher.mock.calls.map(([url, init]) => [
      new URL(String(url)).pathname,
      new Headers(init?.headers).get('Authorization'),
    ]),
  ).toEqual([
    ['/v1/account', 'Bearer customer'],
    ['/v1/personal/prompts', 'Bearer customer'],
    ['/v1/prompts/reverse/capabilities', 'Bearer customer'],
  ])
  expect(new Headers(fetcher.mock.calls[1]![1]?.headers).get('X-Test')).toBe('retained')
})

it.each([
  'admin/settings',
  'ai-endpoints',
  'image-measurements',
  'monitoring',
  'prompt-templates',
  'prompt-reverse-settings',
  'projects/../../admin/users',
  'assets/%2e%2e/%2e%2e/admin/users',
  '/v1/admin/storage',
  'https://other.example/v1/account',
])('rejects cross-scope or escaping frontend paths before fetching: %s', async (path) => {
  await expect(frontendRequest(path)).rejects.toThrow()
  await expect(libraryRequest(path)).rejects.toThrow()
  await expect(reverseRequest(path)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})

it('does not fall back to the other session when a required login is missing', async () => {
  localStorage.removeItem('istudio-access-token')
  await expect(frontendRequest('account')).rejects.toBeInstanceOf(FrontendRequestError)
  expect(fetcher).not.toHaveBeenCalled()
})

it('preserves reverse error status and cannot override the user session through request headers', async () => {
  await frontendRequest('account', { headers: { Authorization: 'Bearer operator' } })
  expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
    'Bearer customer',
  )
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: '会话已过期' }), { status: 401 }),
  )
  await expect(reverseRequest('prompts/reverse')).rejects.toMatchObject({
    status: 401,
    message: '会话已过期',
  })
  expect(ReverseRequestError).toBe(FrontendRequestError)
})

it('keeps public branding reads anonymous', async () => {
  await readSiteBranding()
  expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('Authorization')).toBe(false)
})
