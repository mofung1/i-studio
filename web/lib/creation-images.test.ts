// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { addCreationImage, appendCreationImages, type StoredImage } from './creation-images'
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

it('rejects a new reference at capacity without removing or reordering existing images', () => {
  const images = Array.from({ length: 6 }, (_, index) => ({ ...source, assetId: `image-${index}` }))
  const result = addCreationImage(images, source, 6)
  expect(result.status).toBe('full')
  expect(result.images).toBe(images)
  expect(result.images.map((image) => (image as StoredImage).assetId)).toEqual([
    'image-0',
    'image-1',
    'image-2',
    'image-3',
    'image-4',
    'image-5',
  ])
})

it('does not silently replace a single-image slot', () => {
  const original = { ...source, assetId: 'original-product' }
  const result = addCreationImage([original], source, 1)
  expect(result).toEqual({ status: 'full', images: [original] })
})

it('recognizes a stored reference already selected even when the selection is full', () => {
  const images = [source]
  const result = addCreationImage(
    images,
    { ...source, name: 'same image with updated metadata' },
    1,
  )
  expect(result.status).toBe('existing')
  expect(result.images).toBe(images)
})

it('adds a distinct image in order without mutating the source selection', () => {
  const images = [source]
  const local = new File(['image'], 'image.png', { type: 'image/png' })
  const result = addCreationImage(images, local, 2)
  expect(result.status).toBe('added')
  expect(result.images).toEqual([source, local])
  expect(images).toEqual([source])
  expect(addCreationImage(result.images, local, 2).status).toBe('existing')
})

it('uses the selection at completion when another image filled the last slot', async () => {
  let images = [source]
  let complete: (image: StoredImage) => void = () => {}
  const loading = new Promise<StoredImage>((resolve) => {
    complete = resolve
  })
  const insertion = loading.then((image) => addCreationImage(images, image, 2))
  const concurrentlyAdded = { ...source, assetId: 'new-user-selection' }
  images = [...images, concurrentlyAdded]
  complete({ ...source, assetId: 'loaded-result' })
  expect(await insertion).toEqual({ status: 'full', images: [source, concurrentlyAdded] })
})
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
