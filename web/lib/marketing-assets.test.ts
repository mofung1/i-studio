import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { galleryAssets, heroArtwork, marketingAssets, productComparison } from './marketing-assets'
import { tools } from './marketing-content'

const manifest = JSON.parse(
  readFileSync(resolve('../docs/marketing-visuals/manifest.json'), 'utf8'),
) as {
  assets: {
    id: string
    src: string
    width: number
    height: number
    bytes: number
    referenceId?: string
    sourceSha256?: string
    mode: string
  }[]
}

it('ships every configured image at its real dimensions and within the web resource budget', () => {
  for (const asset of Object.values(marketingAssets)) {
    const entry = manifest.assets.find((item) => item.id === asset.id)!
    expect(entry, asset.id).toBeDefined()
    expect([asset.src, asset.width, asset.height]).toEqual([entry.src, entry.width, entry.height])
    expect(statSync(resolve('public', asset.src.slice(1))).size).toBe(entry.bytes)
    expect(entry.bytes).toBeLessThan(400 * 1024)
    expect(asset.src.startsWith('/images/marketing/')).toBe(true)
    expect(asset.alt.length).toBeGreaterThan(10)
  }
  expect(manifest.assets.reduce((sum, item) => sum + item.bytes, 0)).toBeLessThan(2.5 * 1024 * 1024)
})

it('uses one wide hero artwork and eight gallery selections', () => {
  expect(heroArtwork.sections).toContain('hero')
  expect(heroArtwork.ratio).toBe('16:9')
  expect(new Set(galleryAssets.map((asset) => asset.id)).size).toBe(8)
  expect(manifest.assets.filter((entry) => entry.sourceSha256)).toHaveLength(11)
})

it('uses an explicit reference edit for the same-product comparison and preserves source provenance', () => {
  const { before, after } = productComparison
  expect(after.referenceId).toBe(before.id)
  expect(after.provenance).toBe('reference-image-edit')
  const source = manifest.assets.find((entry) => entry.id === before.id)!
  const edit = manifest.assets.find((entry) => entry.id === after.id)!
  expect(source.mode).toBe('new-generation')
  expect(edit.mode).toBe('reference-image-edit')
  expect(edit.referenceId).toBe(source.id)
  expect(edit.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(edit.sourceSha256).not.toBe(source.sourceSha256)
})

it('uses only the new artwork on every tool landing page', () => {
  for (const tool of tools)
    for (const example of tool.examples) {
      expect(example.image, tool.slug).toBeDefined()
      expect(example.image?.src.startsWith('/images/marketing/')).toBe(true)
      expect(example.description).toBe('AI 视觉概念示例')
    }
})
