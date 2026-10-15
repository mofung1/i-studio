import { describe, expect, it } from 'vitest'
import { assetFilename, mergeLibraryPage, type LibraryAsset } from './library'

describe('library page boundaries', () => {
  it('keeps already loaded images when a page boundary overlaps', () => {
    expect(mergeLibraryPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])
  })
  it('uses the real image format and safe download name', () => {
    expect(assetFilename({ title: '产品/夏季', mime: 'image/jpeg' } as LibraryAsset)).toBe(
      '产品_夏季.jpg',
    )
  })
})
