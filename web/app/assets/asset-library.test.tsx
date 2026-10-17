// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LibraryAsset } from '@/lib/library'
import { downloadProtectedAsset } from '@/components/authenticated-image'
import { AssetLibrary } from './asset-library'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/account-access', () => ({
  AccountBoundary: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/studio-shell', () => ({
  StudioShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/prompt-reverse-provider', () => ({
  usePromptReverse: () => ({ openReverse: vi.fn() }),
}))
vi.mock('@/components/assets/asset-preview', () => ({
  AssetPreview: ({ asset }: { asset: LibraryAsset }) => (
    <div role="dialog" data-preview={asset.id} />
  ),
}))
vi.mock('@/components/image-comparison-button', async () => ({
  LazyImageComparison: (await import('@/components/image-comparison-dialog')).ImageComparisonDialog,
}))
vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} />,
  useProtectedImageUrl: (path: string) => ({ source: path, state: 'loaded', retry: vi.fn() }),
  downloadProtectedAsset: vi.fn().mockResolvedValue(undefined),
}))
let root: Root
let container: HTMLDivElement
let assets: LibraryAsset[]
let requests: Array<{ path: string; method: string; body?: Record<string, unknown> }>
const asset = (index: number): LibraryAsset => ({
  id: `asset-${index}`,
  title: `作品 ${index}`,
  filename: `${index}.png`,
  mime: 'image/png',
  width: 800,
  height: 600,
  sizeBytes: 100,
  favorite: index === 1,
  tags: [],
  projectId: '',
  projectName: '',
  createdAt: '2026-10-18T00:00:00Z',
  contentPath: `/v1/assets/asset-${index}/content`,
  thumbnailPath: `/v1/assets/asset-${index}/thumbnail`,
})
const button = (label: string, host: ParentNode = container) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
  )!
const select = (index: number) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="选择 作品 ${index}"]`)!
const group = () => container.querySelector('[aria-label="图片批量操作"]')!
const escape = async (target: EventTarget = document) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
  })
const render = () => act(async () => root.render(<AssetLibrary view="images" />))
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:zip')
      static revokeObjectURL = vi.fn()
    },
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  localStorage.setItem('istudio-access-token', 'selection-test')
  assets = [asset(1), asset(2), asset(3)]
  requests = []
  vi.mocked(downloadProtectedAsset).mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path: url.pathname, method, body })
      if (url.pathname === '/v1/projects') return Response.json({ projects: [] })
      if (method === 'PATCH') {
        assets = assets.map((item) =>
          body.ids.includes(item.id) ? { ...item, favorite: body.favorite ?? item.favorite } : item,
        )
        return Response.json({ updated: body.ids.length })
      }
      if (url.pathname === '/v1/library/download') return new Response('zip')
      const filtered = assets.filter(
        (item) => url.searchParams.get('favorite') !== 'true' || item.favorite,
      )
      return Response.json({ assets: filtered, total: filtered.length, nextCursor: '' })
    }),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('explains why comparison is unavailable and closes a menu before exiting selection', async () => {
  await render()
  await act(async () => select(1).click())
  expect(container.querySelector('.asset-context-row')?.contains(group())).toBe(true)
  expect(container.querySelector('.library-filter-row')).toBeNull()
  expect(button('图片对比')).toBeUndefined()
  await act(async () => button('更多图片操作').click())
  expect(button('图片对比').disabled).toBe(true)
  expect(group().textContent).toContain('请选择两张图片进行对比')
  await escape(button('更多图片操作'))
  expect(container.querySelector('[role="menu"]')).toBeNull()
  expect(group()).not.toBeNull()
  await escape()
  expect(group()).toBeNull()
  expect(container.querySelector('.library-filter-row')).not.toBeNull()
})

it('opens the two selected images, supports comparison controls and preserves selection on close', async () => {
  await render()
  await act(async () => {
    select(2).click()
    select(1).click()
  })
  await act(async () => button('图片对比').click())
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('.comparison-image'))
  expect(images.map((image) => image.getAttribute('src'))).toEqual([
    '/v1/assets/asset-2/content',
    '/v1/assets/asset-1/content',
  ])
  await act(async () => button('放大对比图片', document).click())
  expect(document.querySelector('[aria-label="对比缩放倍率"]')?.textContent).toContain('1.25')
  await act(async () => button('滑杆对比', document).click())
  expect(document.querySelector('.comparison-overlay')).not.toBeNull()
  await act(async () => button('交换两张图片', document).click())
  expect(
    document.querySelector('.comparison-overlay > .comparison-image')?.getAttribute('src'),
  ).toBe('/v1/assets/asset-2/content')
  await escape()
  expect(document.querySelector('.comparison-dialog')).toBeNull()
  expect(group().textContent).toContain('已选 2 张')
  await escape()
  expect(group()).toBeNull()
})

it('downloads one original and uses the archive endpoint for multiple images', async () => {
  await render()
  await act(async () => select(2).click())
  await act(async () => button('下载原图', group()).click())
  expect(downloadProtectedAsset).toHaveBeenCalledWith('/v1/assets/asset-2/content', '作品 2.png')
  await act(async () => select(1).click())
  await act(async () => button('打包下载', group()).click())
  expect(requests.find((item) => item.path === '/v1/library/download')?.body).toEqual({
    ids: ['asset-2', 'asset-1'],
  })
})

it('toggles favorite for mixed selections without clearing them or reloading the gallery', async () => {
  await render()
  await act(async () => {
    select(1).click()
    select(2).click()
  })
  await act(async () => button('收藏', group()).click())
  expect(select(1).checked && select(2).checked).toBe(true)
  expect(button('取消收藏', group())).toBeDefined()
  await act(async () => button('取消收藏', group()).click())
  expect(select(1).checked && select(2).checked).toBe(true)
  expect(
    requests.filter((item) => item.method === 'PATCH').map((item) => item.body?.favorite),
  ).toEqual([true, false])
  expect(
    requests.filter((item) => item.path === '/v1/library/assets' && item.method === 'GET'),
  ).toHaveLength(1)
})

it('removes unfavorited images and clears their selection in the favorites view', async () => {
  await render()
  await act(async () => button('我的收藏').click())
  await act(async () => select(1).click())
  await act(async () => button('取消收藏', group()).click())
  expect(group()).toBeNull()
  expect(select(1)).toBeNull()
  expect(container.querySelector('.library-count')?.textContent).toBe('0 张图片')
})

it('uses cover clicks to continue selecting and keeps a separate preview control', async () => {
  await render()
  await act(async () => select(1).click())
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('.asset-card:nth-child(2) .asset-cover-open')!
      .click(),
  )
  expect(select(2).checked).toBe(true)
  expect(document.querySelector('[data-preview]')).toBeNull()
  await act(async () => button('查看 作品 2').click())
  expect(document.querySelector('[data-preview]')?.getAttribute('data-preview')).toBe('asset-2')
  expect(select(2).checked).toBe(true)
})

it('limits select-loaded to 100 and supports keyboard navigation in its menu', async () => {
  assets = Array.from({ length: 120 }, (_, index) => asset(index + 1))
  await render()
  await act(async () => select(1).click())
  await act(async () => button('已选 1 张，选择范围').click())
  expect(document.activeElement?.textContent).toBe('选择已加载图片')
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  expect(document.activeElement?.textContent).toBe('清空选择')
  await act(async () => button('选择已加载图片').click())
  expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(100)
  expect(group().textContent).toContain('已选 100 张')
})

it('shows a clear error instead of silently comparing other assets for an invalid pair', async () => {
  assets[1]!.contentPath = assets[0]!.contentPath
  await render()
  await act(async () => {
    select(1).click()
    select(2).click()
  })
  await act(async () => button('图片对比').click())
  expect(document.querySelector('.comparison-dialog')).toBeNull()
  expect(group().querySelector('[role="alert"]')?.textContent).toContain('两张不同且可读取的图片')
})

it('locks the selection while a batch action is pending and restores controls afterward', async () => {
  const originalFetch = fetch
  let finish: (response: Response) => void = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? new Promise<Response>((resolve) => {
            finish = resolve
          })
        : originalFetch(input, init),
    ),
  )
  await render()
  await act(async () => select(2).click())
  await act(async () => button('收藏', group()).click())
  expect(group().getAttribute('aria-busy')).toBe('true')
  expect(select(2).disabled).toBe(true)
  expect(container.querySelector<HTMLButtonElement>('.asset-cover-open')?.disabled).toBe(true)
  expect(button('取消选择').disabled).toBe(true)
  await act(async () => finish(Response.json({ updated: 1 })))
  expect(group().getAttribute('aria-busy')).toBe('false')
  expect(select(2).checked).toBe(true)
  expect(select(2).disabled).toBe(false)
})

it('fills an emptied favorites page when more favorite images remain', async () => {
  assets[1]!.favorite = true
  const originalFetch = fetch
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.searchParams.get('favorite') === 'true' && !init?.method) {
        const favorites = assets.filter((item) => item.favorite)
        return Promise.resolve(
          Response.json({
            assets: favorites.slice(0, 1),
            total: favorites.length,
            nextCursor: favorites.length > 1 ? 'more' : '',
          }),
        )
      }
      return originalFetch(input, init)
    }),
  )
  await render()
  await act(async () => button('我的收藏').click())
  expect(container.querySelector('.library-count')?.textContent).toBe('2 张图片')
  await act(async () => select(1).click())
  await act(async () => button('取消收藏', group()).click())
  expect(group()).toBeNull()
  expect(select(1)).toBeNull()
  expect(select(2)).not.toBeNull()
  expect(container.querySelector('.library-count')?.textContent).toBe('1 张图片')
  expect(container.querySelector('.library-empty-state')).toBeNull()
})
