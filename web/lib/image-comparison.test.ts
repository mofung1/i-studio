import { describe, expect, it } from 'vitest'
import {
  clampComparisonPan,
  clampComparisonZoom,
  comparisonCandidates,
  comparisonDivider,
  comparisonReferences,
} from './image-comparison'

describe('image comparison geometry and sources', () => {
  it('includes original product and reference images without duplicates', () => {
    expect(
      comparisonReferences({
        productAssetIds: ['a'],
        referenceAssetIds: ['a', 'b'],
        modelAssetId: 'c',
        sceneAssetId: '../bad',
      }).map((item) => item.label),
    ).toEqual(['商品原图 1', '参考原图 2', '模特参考图'])
    expect(comparisonReferences()).toEqual([])
  })
  it('limits shared movement to the current zoom and resets fit movement', () => {
    expect(clampComparisonPan({ x: 1, y: -1 }, 1)).toEqual({ x: 0, y: 0 })
    expect(clampComparisonPan({ x: 2, y: -0.2 }, 2)).toEqual({ x: 0.5, y: -0.2 })
    expect(clampComparisonZoom(Number.NaN)).toBe(1)
    expect(clampComparisonZoom(20)).toBe(8)
  })
  it('keeps divider values in the image stage coordinate system', () => {
    expect(comparisonDivider(300, 100, 400)).toBe(50)
    expect(comparisonDivider(-1, 100, 400)).toBe(0)
    expect(comparisonDivider(800, 100, 400)).toBe(100)
    expect(comparisonDivider(0, 0, 0)).toBe(50)
  })
  it('deduplicates sources and excludes unsupported or credential-bearing URLs', () => {
    const items = comparisonCandidates([
      { path: '/v1/assets/a/content', label: 'A' },
      { path: '/v1/assets/a/content', label: 'Duplicate' },
      { path: '/v1/assets/b/content', label: 'B' },
      { path: 'javascript:alert(1)', label: 'Invalid' },
      { path: 'https://username:password@example.test/image.png', label: 'Credential URL' },
      { path: '/v1/assets/../content', label: 'Traversal' },
    ])
    expect(items.map((item) => item.label)).toEqual(['A', 'B'])
  })
})
