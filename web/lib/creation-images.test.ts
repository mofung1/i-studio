// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { appendCreationImages, type StoredImage } from './creation-images'
import { uploadAsset } from './api'
import { loadStoredImage } from './library'

export const source: StoredImage = {
  kind: 'asset',
  assetId: 'owned-image',
  name: '原图',
  type: 'image/png',
  size: 100,
  width: 800,
  height: 600,
  contentPath: '/v1/assets/owned-image/content',
  thumbnailPath: '/v1/assets/owned-image/thumbnail',
}
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})
it('sends stored IDs and preserves the order of mixed local and stored images', () => {
  const body = new FormData()
  appendCreationImages(body, 'garmentImages', [
    source,
    new File(['local'], 'new.png', { type: 'image/png' }),
    { ...source, assetId: 'second' },
  ])
  expect(body.getAll('garmentImages')).toHaveLength(1)
  expect(JSON.parse(body.get('garmentImagesSources') as string)).toEqual([
    { assetId: 'owned-image' },
    { fileIndex: 0 },
    { assetId: 'second' },
  ])
})
it('reuses stored images without any file download or upload', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await uploadAsset(source, 'user-session')).toBe('owned-image')
  expect(fetch).not.toHaveBeenCalled()
})
it('reuses local uploads after checking metadata and uploads again when an asset was removed', async () => {
  const file = new File(['image'], 'test.png', { type: 'image/png' })
  let removed = false
  let uploads = 0
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return new Response(JSON.stringify({ asset: { id: `uploaded-${++uploads}` } }))
    return new Response(JSON.stringify({}), { status: removed ? 404 : 200 })
  })
  vi.stubGlobal('fetch', fetch)
  expect(await uploadAsset(file, 'same-account')).toBe('uploaded-1')
  expect(await uploadAsset(file, 'same-account')).toBe('uploaded-1')
  expect(uploads).toBe(1)
  removed = true
  expect(await uploadAsset(file, 'same-account')).toBe('uploaded-2')
  expect(await uploadAsset(file, 'other-account')).toBe('uploaded-3')
})
it('restores reference metadata without requesting image bytes', async () => {
  localStorage.setItem('istudio-access-token', 'session')
  const fetch = vi.fn(
    async (_url: string) =>
      new Response(
        JSON.stringify({
          asset: {
            id: 'owned-image',
            filename: 'image.png',
            mime: 'image/png',
            sizeBytes: 100,
            width: 800,
            height: 600,
            contentPath: source.contentPath,
            thumbnailPath: source.thumbnailPath,
          },
        }),
      ),
  )
  vi.stubGlobal('fetch', fetch)
  expect((await loadStoredImage(source.contentPath)).assetId).toBe('owned-image')
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0]?.[0]).toContain('/metadata')
})
