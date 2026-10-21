import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { showcaseTools } from './tool-showcase'
import { showcaseAssets } from './tool-showcase-assets'
import { tools } from './marketing-content'

const manifest = JSON.parse(
  readFileSync(resolve('../docs/marketing-visuals/tool-showcase/manifest.json'), 'utf8'),
) as {
  assets: {
    id: string
    src: string
    width: number
    height: number
    bytes: number
    referenceId: string | null
    sourceSha256: string
    mode: string
  }[]
}

it('keeps five focused demos linked to real SEO pages and existing workspace flows', () => {
  expect(showcaseTools).toHaveLength(5)
  expect(new Set(showcaseTools.map((tool) => tool.id)).size).toBe(5)
  expect(showcaseTools.some((tool) => tool.id === 'reference-creation')).toBe(false)
  for (const tool of showcaseTools) {
    const url = new URL(tool.seoHref, 'http://localhost')
    const slug = url.pathname.split('/').at(-1)!
    expect(tools.some((item) => item.slug === slug)).toBe(true)
    expect(existsSync(resolve(`app/(marketing)/tools/${slug}/page.tsx`))).toBe(true)
    expect(tool.studioHref).toBe(tools.find((item) => item.slug === slug)!.href)
    if (url.hash) expect([slug, url.hash]).toEqual(['ai-image-generator', '#reference'])
  }
})

it('ships newly generated previews with verified file sizes and matching dimensions', () => {
  for (const asset of Object.values(showcaseAssets)) {
    const entry = manifest.assets.find((item) => item.id === asset.id)!
    expect(entry).toBeDefined()
    expect([asset.src, asset.width, asset.height]).toEqual([entry.src, entry.width, entry.height])
    expect(statSync(resolve('public', asset.src.slice(1))).size).toBe(entry.bytes)
    expect(entry.bytes).toBeLessThan(250 * 1024)
    expect(entry.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
  }
  expect(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0)).toBeLessThan(1024 * 1024)
})

it('traces the retouch visual to its actual input image', () => {
  for (const tool of showcaseTools.filter((item) => item.input)) {
    const edit = manifest.assets.find((item) => item.id === tool.asset.id)!
    const input = manifest.assets.find((item) => item.id === tool.input!.id)!
    expect(edit.mode).toBe('reference-image-edit')
    expect(edit.referenceId).toBe(input.id)
    expect(tool.asset.referenceId).toBe(input.id)
    expect(edit.sourceSha256).not.toBe(input.sourceSha256)
  }
})
