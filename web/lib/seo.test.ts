import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSeoEnvironment,
  marketingMetadata,
  marketingSitemap,
  serializeJsonLd,
  siteStructuredData,
} from './seo'
import { marketingPaths, tools } from './marketing-content'
import robots from '@/app/robots'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const production = {
  NODE_ENV: 'production',
  SITE_ENV: 'production',
  NEXT_PUBLIC_SITE_URL: 'https://studio.creator.cn',
}
afterEach(() => vi.unstubAllEnvs())

it('only advertises marketing URLs with actual page routes and valid studio entries', () => {
  for (const path of marketingPaths) {
    expect(existsSync(resolve('app/(marketing)', path.slice(1), 'page.tsx')), path).toBe(true)
  }
  for (const tool of tools) {
    const url = new URL(tool.href, 'http://localhost')
    expect(url.pathname).toBe('/studio')
    if (tool.group === 'commerce') {
      expect(url.searchParams.get('mode')).toBe('commerce')
      expect(['product-main', 'product-retouch', 'clothing-set']).toContain(
        url.searchParams.get('task'),
      )
    }
  }
})

describe('explicit production indexing', () => {
  it('requires a real HTTPS origin and an explicit production deployment', () => {
    expect(getSeoEnvironment(production)).toEqual({
      origin: 'https://studio.creator.cn',
      indexable: true,
    })
    for (const change of [
      { SITE_ENV: undefined },
      { SITE_ENV: 'preview' },
      { NODE_ENV: 'development' },
      { VERCEL_ENV: 'preview' },
      { CONTEXT: 'deploy-preview' },
    ]) {
      expect(getSeoEnvironment({ ...production, ...change })).toEqual({
        origin: undefined,
        indexable: false,
      })
    }
  })
  it.each([
    '',
    'not a url',
    'http://localhost:3000',
    'https://127.0.0.1',
    'https://10.1.2.3',
    'https://172.16.0.1',
    'https://[::1]',
    'https://example.com',
    'https://your-domain.com',
    'https://preview.example.org',
    'https://studio.local',
    'https://studio.test',
    'https://user:secret@studio.creator.cn',
    'https://studio.creator.cn/path',
    'https://studio.creator.cn?draft=1',
  ])('refuses unsafe or placeholder origins: %s', (NEXT_PUBLIC_SITE_URL) => {
    expect(getSeoEnvironment({ ...production, NEXT_PUBLIC_SITE_URL }).indexable).toBe(false)
  })
})

it('has no canonical, production graph or sitemap in local and preview builds', () => {
  vi.stubEnv('SITE_ENV', 'preview')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', production.NEXT_PUBLIC_SITE_URL)
  const meta = marketingMetadata({
    title: '功能',
    description: '描述',
    path: '/tools/image-to-prompt',
    name: '测试品牌',
  })
  expect(meta.alternates).toBeUndefined()
  expect(meta.robots).toEqual({ index: false, follow: false })
  expect(marketingSitemap(marketingPaths)).toEqual([])
  expect(siteStructuredData('测试品牌')).toBeNull()
  expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } })
})

it('uses unique canonical URLs and titles, and only includes marketing routes in production', () => {
  for (const [key, value] of Object.entries(production)) vi.stubEnv(key, value)
  const metadata = tools.map((tool) =>
    marketingMetadata({
      title: tool.title,
      description: tool.description,
      path: `/tools/${tool.slug}`,
      name: '自定义品牌',
    }),
  )
  expect(new Set(metadata.map((meta) => JSON.stringify(meta.title))).size).toBe(5)
  expect(new Set(tools.map((tool) => tool.description)).size).toBe(5)
  expect(new Set(tools.map((tool) => tool.h1)).size).toBe(5)
  expect(metadata[0]?.title).toEqual({ absolute: `${tools[0]!.title} | 自定义品牌` })
  expect(metadata[0]?.alternates?.canonical).toBe(
    `${production.NEXT_PUBLIC_SITE_URL}/tools/ai-image-generator`,
  )
  expect(marketingSitemap(marketingPaths).map((item) => item.url)).toEqual(
    marketingPaths.map((path) => `${production.NEXT_PUBLIC_SITE_URL}${path}`),
  )
  expect(marketingSitemap(marketingPaths)).toHaveLength(6)
  expect(robots().sitemap).toBe(`${production.NEXT_PUBLIC_SITE_URL}/sitemap.xml`)
  expect(JSON.stringify(siteStructuredData('自定义品牌'))).toContain('自定义品牌')
})

it('escapes script-breaking content in server-rendered JSON-LD', () => {
  const serialized = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
  expect(serialized).not.toContain('<')
  expect(JSON.parse(serialized).name).toBe('</script><script>alert(1)</script>')
})
