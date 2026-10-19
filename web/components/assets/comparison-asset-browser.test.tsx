// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ComparisonAssetBrowser } from './comparison-asset-browser'

vi.mock('@/components/library-controls', () => ({
  LibrarySelect: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    options: Array<[string, string]>
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}))
let root: Root
let container: HTMLDivElement
let urls: URL[]
let fail: boolean
const onSelect = vi.fn()
const asset = (id: string) => ({
  id,
  title: id,
  contentPath: `/v1/assets/${id}/content`,
  thumbnailPath: `/v1/assets/${id}/thumbnail`,
  width: 800,
  height: 600,
})
const button = (label: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label,
  )!
const render = () =>
  act(async () =>
    root.render(
      <ComparisonAssetBrowser
        anchor={{ path: '/v1/assets/a/content', label: 'a' }}
        side="b"
        projectId="launch"
        suggestions={[{ path: '/v1/assets/b/content', label: 'b' }]}
        onSelect={onSelect}
      />,
    ),
  )
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-access-token', 'browser-test')
  urls = []
  fail = false
  onSelect.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(String(input))
      urls.push(url)
      if (url.pathname === '/v1/projects')
        return Response.json({ projects: [{ id: 'launch', name: '新品上架' }] })
      if (fail) {
        fail = false
        return Response.json({ message: '图片库暂时无法读取' }, { status: 503 })
      }
      return Response.json(
        url.searchParams.get('cursor')
          ? { assets: [asset('b'), asset('c')], nextCursor: '' }
          : { assets: [asset('a'), asset('b')], nextCursor: 'next' },
      )
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
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('excludes the opposite image, deduplicates related and paged results, and returns a chosen source', async () => {
  await render()
  expect(button('选择对比图片 a')).toBeUndefined()
  expect(container.querySelectorAll('[aria-label="选择对比图片 b"]')).toHaveLength(1)
  await act(async () => button('加载更多图片').click())
  expect(container.querySelectorAll('[aria-label="选择对比图片 b"]')).toHaveLength(1)
  await act(async () => button('选择对比图片 c').click())
  expect(onSelect).toHaveBeenCalledWith({
    path: '/v1/assets/c/content',
    label: 'c',
    width: 800,
    height: 600,
  })
  expect(
    urls.some(
      (url) =>
        url.searchParams.get('projectId') === 'launch' && url.searchParams.get('cursor') === 'next',
    ),
  ).toBe(true)
})
it('keeps the current image in place while a failed request can be retried', async () => {
  fail = true
  await render()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('图片库暂时无法读取')
  expect(container.querySelector('.comparison-anchor strong')?.textContent).toBe('a')
  await act(async () => button('重试').click())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(button('加载更多图片')).toBeDefined()
})
it('ignores a late response from an abandoned source filter', async () => {
  const originalFetch = fetch
  let finish: (response: Response) => void = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) =>
      new URL(String(input)).searchParams.get('kind') === 'uploads'
        ? new Promise<Response>((resolve) => {
            finish = resolve
          })
        : originalFetch(input, init),
    ),
  )
  await render()
  const select = container.querySelector<HTMLSelectElement>('[aria-label="对比图片来源"]')!
  await act(async () => {
    select.value = 'uploads'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => {
    select.value = 'generated'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => finish(Response.json({ assets: [asset('stale')], nextCursor: '' })))
  expect(button('选择对比图片 stale')).toBeUndefined()
  expect(button('选择对比图片 b')).toBeDefined()
})
