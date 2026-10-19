import { expect, it, vi } from 'vitest'
import { reuseExistingCreationImage, type StoredImage } from './creation-images'

const stored: StoredImage = {
  kind: 'asset',
  assetId: 'original',
  name: 'original.png',
  type: 'image/png',
  size: 4,
  width: 100,
  height: 100,
  contentPath: '/v1/assets/original/content',
  thumbnailPath: '/v1/assets/original/thumbnail',
}

it('reuses the selected asset when a restored reverse file has the same bytes', async () => {
  const load = vi.fn(async () => new Blob(['same'], { type: 'image/png' }))
  const restored = new File(['same'], 'renamed.png', { type: 'image/png' })
  expect(await reuseExistingCreationImage(restored, [stored], load)).toBe(stored)
  expect(load).toHaveBeenCalledOnce()
})

it('keeps distinct images with the same filename and size', async () => {
  const load = vi.fn(async () => new Blob(['diff'], { type: 'image/png' }))
  const restored = new File(['same'], stored.name, { type: 'image/png' })
  expect(await reuseExistingCreationImage(restored, [stored], load)).toBe(restored)
})

it('reuses local files by content after restoring an older analysis', async () => {
  const original = new File(['same'], 'local.png', { type: 'image/png' })
  const restored = new File(['same'], 'reverse.png', { type: 'image/png' })
  const load = vi.fn()
  expect(await reuseExistingCreationImage(restored, [original], load)).toBe(original)
  expect(load).not.toHaveBeenCalled()
})

it('avoids downloading bytes for known IDs and incompatible sizes', async () => {
  const load = vi.fn()
  expect(await reuseExistingCreationImage({ ...stored }, [stored], load)).toBe(stored)
  const different = new File(['longer image'], stored.name, { type: 'image/png' })
  expect(await reuseExistingCreationImage(different, [stored], load)).toBe(different)
  expect(load).not.toHaveBeenCalled()
})
