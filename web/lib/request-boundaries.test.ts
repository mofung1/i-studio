// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { adminFetch, adminRequest } from './admin'
import { frontendRequest, FrontendRequestError } from './frontend-request'
import { libraryRequest } from './library'
import { reverseRequest, ReverseRequestError } from './prompt-reverse'
import { readSiteBranding } from './site-settings'
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

it('uses explicit user and administrator sessions for every request family', async () => {
  await frontendRequest('account')
  await libraryRequest('personal/prompts', { headers: new Headers({ 'X-Test': 'retained' }) })
  await reverseRequest('prompts/reverse/capabilities')
  await adminRequest('ai-endpoints')
  await adminRequest('inspiration/prompts?includeDisabled=true')
  await adminRequest('storage')
  await adminRequest('monitoring')
  await adminRequest('image-measurements?endpointId=channel&model=image-model')
  expect(
    fetcher.mock.calls.map(([url, init]) => [
      new URL(String(url)).pathname,
      new Headers(init?.headers).get('Authorization'),
    ]),
  ).toEqual([
    ['/v1/account', 'Bearer customer'],
    ['/v1/personal/prompts', 'Bearer customer'],
    ['/v1/prompts/reverse/capabilities', 'Bearer customer'],
    ['/v1/admin/ai-endpoints', 'Bearer operator'],
    ['/v1/admin/inspiration/prompts', 'Bearer operator'],
    ['/v1/admin/storage', 'Bearer operator'],
    ['/v1/admin/monitoring', 'Bearer operator'],
    ['/v1/admin/image-measurements', 'Bearer operator'],
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

it.each([
  'account',
  'assets/a/content',
  'generation/tasks',
  'personal/prompts',
  'users/../../account',
  'admin/storage',
])('rejects frontend or accidentally double-prefixed admin paths: %s', async (path) => {
  await expect(adminRequest(path)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})

it('does not fall back to the other session when a required login is missing', async () => {
  localStorage.removeItem('istudio-admin-token')
  await expect(adminRequest('settings')).rejects.toThrow('请先登录运营后台')
  localStorage.setItem('istudio-admin-token', 'operator')
  localStorage.removeItem('istudio-access-token')
  await expect(frontendRequest('account')).rejects.toBeInstanceOf(FrontendRequestError)
  expect(fetcher).not.toHaveBeenCalled()
})

it('preserves reverse error status and cannot override either session through request headers', async () => {
  await frontendRequest('account', { headers: { Authorization: 'Bearer operator' } })
  await adminFetch('settings', { headers: { Authorization: 'Bearer customer' } })
  expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get('Authorization')).toBe(
    'Bearer customer',
  )
  expect(new Headers(fetcher.mock.calls[1]![1]?.headers).get('Authorization')).toBe(
    'Bearer operator',
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

it('keeps public branding reads anonymous and branding writes in the admin realm', async () => {
  await readSiteBranding()
  const logo = new File(['image'], 'logo.png', { type: 'image/png' })
  await saveSiteBranding('Studio', logo, false)
  expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('Authorization')).toBe(false)
  const [url, init] = fetcher.mock.calls[1]!
  expect(new URL(String(url)).pathname).toBe('/v1/admin/site-settings')
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer operator')
  expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
  expect((init?.body as FormData).get('logo')).toBeInstanceOf(File)
})
