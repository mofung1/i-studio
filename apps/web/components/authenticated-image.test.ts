import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('protected image cache account isolation', () => {
  let token: string
  beforeEach(() => {
    vi.resetModules(); token = 'account-a'
    vi.stubGlobal('window', { localStorage: { getItem: () => token } })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${Math.random()}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
  it('requires authorization again for the same path after switching accounts', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(new Blob(['image'], { type: 'image/png' })))
    vi.stubGlobal('fetch', fetch)
    const { loadProtectedImage } = await import('./authenticated-image')
    await loadProtectedImage('/v1/assets/private/content')
    await loadProtectedImage('/v1/assets/private/content')
    expect(fetch).toHaveBeenCalledTimes(1)
    token = 'account-b'
    await loadProtectedImage('/v1/assets/private/content')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]?.[1].headers.Authorization).toBe('Bearer account-b')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
  it('rejects an old inflight response and preserves the new account request', async () => {
    let resolveOld: (response: Response) => void = () => {}
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve }))
      .mockImplementation(async () => new Response(new Blob(['new-image'], { type: 'image/png' })))
    vi.stubGlobal('fetch', fetch)
    const { loadProtectedImage } = await import('./authenticated-image')
    const old = loadProtectedImage('/v1/assets/private/content')
    token = 'account-b'
    const current = await loadProtectedImage('/v1/assets/private/content')
    const rejected = expect(old).rejects.toThrow('账号已切换')
    resolveOld(new Response(new Blob(['old-image'], { type: 'image/png' })))
    await rejected
    expect((await loadProtectedImage('/v1/assets/private/content')).url).toBe(current.url)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('evicts by byte budget before reaching the image count limit', async () => {
    const fetch = vi.fn().mockImplementation(async () => ({ ok: true, blob: async () => ({ size: 50 * 1024 * 1024 }) }))
    vi.stubGlobal('fetch', fetch)
    const { loadProtectedImage } = await import('./authenticated-image')
    await loadProtectedImage('/v1/assets/large-a/content')
    await loadProtectedImage('/v1/assets/large-b/content')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    await loadProtectedImage('/v1/assets/large-a/content')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

})
