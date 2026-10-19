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
  AssetPreview: ({
    asset,
    onCompare,
    onCompareOriginal,
  }: {
    asset: LibraryAsset
    onCompare: () => void
    onCompareOriginal?: () => void
  }) => (
    <div role="dialog" data-preview={asset.id}>
      <button onClick={onCompare}>对比</button>
      {onCompareOriginal && <button onClick={onCompareOriginal}>与原图对比</button>}
    </div>
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
const enterBatch = () => act(async () => button('批量管理').click())
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
      if (url.pathname === '/v1/projects')
        return Response.json({
          projects: [
            { id: 'launch', name: '新品上架' },
            { id: 'summer', name: '夏季活动' },
          ],
        })
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

it('keeps normal browsing free of checkboxes and only enters selection on request', async () => {
  await render()
  expect(select(1)).toBeNull()
  expect(group()).toBeNull()
  await act(async () => button('查看 作品 1').click())
  expect(document.querySelector('[data-preview]')?.getAttribute('data-preview')).toBe('asset-1')
})

it('enters an empty batch mode, closes its menu before exiting, and clears without leaving', async () => {
  await render()
  await enterBatch()
  expect(button('打包下载', group()).disabled).toBe(true)
  await act(async () => select(1).click())
  await act(async () => button('已选 1 张，选择范围').click())
  await escape(button('已选 1 张，选择范围'))
  expect(container.querySelector('[role="menu"]')).toBeNull()
  expect(select(1).checked).toBe(true)
  await act(async () => button('已选 1 张，选择范围').click())
  await act(async () => button('清空选择').click())
  expect(group().textContent).toContain('已选 0 张')
  await escape()
  expect(group()).toBeNull()
  expect(select(1)).toBeNull()
})

it('starts comparison from one image, chooses B visually, and supports comparison controls', async () => {
  await render()
  await act(async () => button('查看 作品 2').click())
  await act(async () => button('对比').click())
  expect(document.querySelector('.comparison-choose-layout')).not.toBeNull()
  expect(document.querySelector('[data-preview]')).toBeNull()
  expect(button('选择对比图片 作品 2', document)).toBeUndefined()
  await act(async () => button('选择对比图片 作品 1', document).click())
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('.comparison-image'))
  expect(images.map((image) => image.getAttribute('src'))).toEqual([
    '/v1/assets/asset-2/content',
    '/v1/assets/asset-1/content',
  ])
  await act(async () => button('放大对比图片', document).click())
  expect(document.querySelector('[aria-label="对比缩放倍率"]')?.textContent).toContain('1.25')
  await act(async () => button('滑杆对比', document).click())
  expect(document.querySelector('.comparison-overlay')).not.toBeNull()
  await act(async () => button('更换图片 B', document).click())
  expect(document.querySelector('.comparison-choose-layout')).not.toBeNull()
  await escape()
  expect(document.querySelector('.comparison-choose-layout')).toBeNull()
  expect(document.querySelector('.comparison-dialog')).not.toBeNull()
  await escape()
  expect(document.querySelector('.comparison-dialog')).toBeNull()
  expect(select(1)).toBeNull()
})

it('downloads one original and uses the archive endpoint for multiple images', async () => {
  await render()
  await enterBatch()
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
  await enterBatch()
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
  await enterBatch()
  await act(async () => button('我的收藏').click())
  await enterBatch()
  await act(async () => select(1).click())
  await act(async () => button('取消收藏', group()).click())
  expect(group().textContent).toContain('已选 0 张')
  expect(select(1)).toBeNull()
  expect(container.querySelector('.library-count')?.textContent).toBe('0 张图片')
})

it('uses cover clicks to continue selecting and keeps a separate preview control', async () => {
  await render()
  await enterBatch()
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
  await enterBatch()
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

it('provides an original-image shortcut when the generation has reference images', async () => {
  assets[0]!.task = {
    id: 'task',
    status: 'succeeded',
    createdAt: assets[0]!.createdAt,
    input: { productAssetIds: ['original'] },
  }
  await render()
  await act(async () => button('查看 作品 1').click())
  await act(async () => button('与原图对比').click())
  expect(document.querySelector('.comparison-choose-layout')).toBeNull()
  expect(
    Array.from(document.querySelectorAll<HTMLImageElement>('.comparison-image')).map((image) =>
      image.getAttribute('src'),
    ),
  ).toEqual(['/v1/assets/original/content', '/v1/assets/asset-1/content'])
})

it('moves one image from its card and prevents submitting its current project', async () => {
  await render()
  await act(async () => button('移动 作品 2 至项目').click())
  expect(button('已在此项目', document).disabled).toBe(true)
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="radio"][value="launch"]')!.click(),
  )
  await act(async () => button('确认移动', document).click())
  expect(requests.find((item) => item.method === 'PATCH')?.body).toEqual({
    ids: ['asset-2'],
    projectId: 'launch',
  })
  expect(container.querySelector('.asset-card:nth-child(2)')?.textContent).toContain('新品上架')
  expect(select(1)).toBeNull()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
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
  await enterBatch()
  await act(async () => select(2).click())
  await act(async () => button('收藏', group()).click())
  expect(group().getAttribute('aria-busy')).toBe('true')
  expect(select(2).disabled).toBe(true)
  expect(container.querySelector<HTMLButtonElement>('.asset-cover-open')?.disabled).toBe(true)
  expect(button('退出批量管理').disabled).toBe(true)
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
  await enterBatch()
  await act(async () => button('我的收藏').click())
  await enterBatch()
  expect(container.querySelector('.library-count')?.textContent).toBe('2 张图片')
  await act(async () => select(1).click())
  await act(async () => button('取消收藏', group()).click())
  expect(group().textContent).toContain('已选 0 张')
  expect(select(1)).toBeNull()
  expect(select(2)).not.toBeNull()
  expect(container.querySelector('.library-count')?.textContent).toBe('1 张图片')
  expect(container.querySelector('.library-empty-state')).toBeNull()
})
