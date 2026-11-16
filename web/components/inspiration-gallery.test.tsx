// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InspirationCard, InspirationGallery } from './inspiration-gallery'
import { inspirationTemplate } from '@/lib/inspiration-handoff'

const fixture = vi.hoisted(() => ({
  id: 'reference-template',
  title: '商品主图',
  prompt: '保留商品外观，重构背景',
  instructions: '上传清晰商品正面图',
  requiresReference: true,
  category: '电商',
  source: '创作者',
  imageUrl: '/public/example.webp',
  width: 600,
  height: 800,
  sortOrder: 0,
}))
const callbacks = vi.hoisted(() => ({
  changeCategory: vi.fn(),
  setSearchInput: vi.fn(),
  clearSearch: vi.fn(),
  resetFilters: vi.fn(),
  reload: vi.fn(),
  loadMore: vi.fn(),
  reloadCategories: vi.fn(),
}))
function initialState() {
  return {
    prompts: [fixture],
    categories: [
      { category: '电商', count: 24 },
      { category: '人像', count: 12 },
      { category: '插画', count: 9 },
      { category: '建筑', count: 7 },
      { category: '海报', count: 6 },
      { category: '摄影', count: 5 },
      { category: '包装设计', count: 4 },
      { category: '服装设计', count: 3 },
    ],
    category: '',
    searchInput: '',
    query: '',
    total: 1,
    allTotal: 70,
    isLoading: false,
    error: '',
    loadMoreError: '',
    hasMore: false,
    categoriesLoading: false,
    categoriesError: '',
    ...callbacks,
  }
}
let state = initialState()
vi.mock('./save-personal-prompt', () => ({ SavePersonalPrompt: () => null }))
vi.mock('./workbench/use-inspiration-prompts', () => ({ useInspirationPrompts: () => state }))
let root: Root
let host: HTMLDivElement
function button(text: string, scope: ParentNode = host) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === text || item.textContent?.trim().startsWith(text),
  )
  if (!result) throw new Error(`Missing button: ${text}`)
  return result
}
function detail() {
  const result = document.querySelector<HTMLDivElement>('[role="dialog"]')
  if (!result) throw new Error('Missing dialog')
  return result
}
function categoryGroup() {
  return host.querySelector<HTMLElement>('[role="group"][aria-label="按分类筛选"]')!
}
async function render(onUsePrompt?: (value: ReturnType<typeof inspirationTemplate>) => void) {
  await act(async () => root.render(<InspirationGallery onUsePrompt={onUsePrompt} />))
}
async function input(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  for (const callback of Object.values(callbacks)) callback.mockReset()
  state = initialState()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it('labels reference-dependent cards and uses the same compact handoff URL in card and detail', async () => {
  await render()
  expect(host.textContent).toContain('需参考图')
  const link = [...host.querySelectorAll('a')].find((item) => item.textContent?.includes('去生图'))!
  expect(link.getAttribute('href')).toBe('/studio?mode=general&inspirationId=reference-template')
  await act(async () => button(`查看${fixture.title}的提示词`).click())
  expect(detail().textContent).toContain(fixture.instructions)
  expect(detail().querySelector('a.studio-primary')?.getAttribute('href')).toBe(
    link.getAttribute('href'),
  )
})

it('passes the complete template to embedded card callbacks without a sample image asset', async () => {
  const apply = vi.fn()
  await act(async () =>
    root.render(
      <InspirationCard
        item={fixture}
        copied={false}
        onInspect={vi.fn()}
        onCopy={vi.fn()}
        onUsePrompt={apply}
      />,
    ),
  )
  await act(async () => button('去生图').click())
  expect(apply).toHaveBeenCalledWith(inspirationTemplate(fixture))
  expect(apply.mock.calls[0]![0]).not.toHaveProperty('imageUrl')
})

it('passes the same complete template from an embedded detail dialog', async () => {
  const apply = vi.fn()
  await render(apply)
  await act(async () => button(`查看${fixture.title}的提示词`).click())
  await act(async () => button('去生图', detail()).click())
  expect(apply).toHaveBeenCalledWith(inspirationTemplate(fixture))
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('finds a less prominent category in the full picker and keeps the chosen category in the main filter row', async () => {
  await render()
  expect(categoryGroup().textContent).not.toContain('服装设计')
  await act(async () => button('全部分类').click())
  const search = detail().querySelector<HTMLInputElement>('[aria-label="搜索分类"]')!
  await input(search, '服装')
  expect(detail().textContent).toContain('服装设计')
  expect(detail().textContent).not.toContain('包装设计')
  await act(async () => button('服装设计', detail()).click())
  expect(callbacks.changeCategory).toHaveBeenCalledWith('服装设计')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  state = { ...state, category: '服装设计', total: 3 }
  await render()
  expect(button('服装设计', categoryGroup()).getAttribute('aria-pressed')).toBe('true')
})

it('lets the search and category controls cooperate and clears the query without discarding the category', async () => {
  state = { ...state, category: '电商', searchInput: '自然光', query: '自然光' }
  await render()
  expect(button('电商', categoryGroup()).getAttribute('aria-pressed')).toBe('true')
  await input(host.querySelector<HTMLInputElement>('[aria-label="搜索提示词"]')!, '棚拍')
  expect(callbacks.setSearchInput).toHaveBeenCalledWith('棚拍')
  await act(async () => button('清除搜索').click())
  expect(callbacks.clearSearch).toHaveBeenCalledOnce()
  expect(callbacks.changeCategory).not.toHaveBeenCalled()
  expect(callbacks.resetFilters).not.toHaveBeenCalled()
})

it('offers a real filter reset for an empty selected category instead of claiming the entire gallery is empty', async () => {
  state = { ...state, category: '包装设计', prompts: [], total: 0 }
  await render()
  expect(host.textContent).toContain('包装设计')
  expect(host.textContent).not.toContain('灵感库还没有内容')
  await act(async () => button('重置筛选').click())
  expect(callbacks.resetFilters).toHaveBeenCalledOnce()
})

it('keeps existing cards when loading the next page fails and retries that page explicitly', async () => {
  state = { ...state, hasMore: true, total: 25, loadMoreError: '下一页读取失败' }
  await render()
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.textContent).toContain('下一页读取失败')
  await act(async () => button('重试加载').click())
  expect(callbacks.loadMore).toHaveBeenCalledOnce()
  expect(callbacks.reload).not.toHaveBeenCalled()
})

it('provides manual loading and prevents a second request while more items are loading', async () => {
  state = { ...state, hasMore: true, total: 25 }
  await render()
  await act(async () => button('加载更多').click())
  expect(callbacks.loadMore).toHaveBeenCalledOnce()
  state = { ...state, isLoading: true }
  await render()
  const more = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    /加载中|正在加载|加载更多/.test(item.textContent ?? ''),
  )
  expect(!more || more.disabled).toBe(true)
  expect(host.querySelectorAll('article')).toHaveLength(1)
})

it('recovers the category list independently of already visible inspiration cards', async () => {
  state = { ...state, categories: [], categoriesError: '分类暂时无法读取' }
  await render()
  expect(host.textContent).toContain('分类暂时无法读取')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  await act(async () => button('重试分类').click())
  expect(callbacks.reloadCategories).toHaveBeenCalledOnce()
  expect(callbacks.reload).not.toHaveBeenCalled()
})

it('shows an actionable first-page error without showing a false empty-library state', async () => {
  state = { ...state, prompts: [], error: '灵感加载失败' }
  await render()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('灵感加载失败')
  expect(host.textContent).not.toContain('灵感库还没有内容')
  await act(async () => button('重新加载').click())
  expect(callbacks.reload).toHaveBeenCalledOnce()
})
