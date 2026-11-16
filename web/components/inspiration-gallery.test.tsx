// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InspirationGallery } from './inspiration-gallery'
import { copyText } from '@/lib/clipboard'
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
const savePrompt = vi.hoisted(() => vi.fn())
vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn() }))
vi.mock('./save-personal-prompt', () => ({
  SavePersonalPrompt: ({ seed }: { seed: unknown }) => (
    <button type="button" onClick={() => savePrompt(seed)}>
      存为私有提示词
    </button>
  ),
}))
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
  vi.mocked(copyText).mockReset()
  savePrompt.mockReset()
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

it('uses one card control and moves template information and actions into the detail', async () => {
  await render()
  const card = host.querySelector('article')!
  const trigger = button(`查看${fixture.title}的提示词`, card)
  expect(card.querySelectorAll('button, a')).toHaveLength(1)
  expect(trigger.textContent).toBe(fixture.title)
  trigger.focus()
  await act(async () => trigger.click())
  expect(detail().textContent).toContain(fixture.category)
  expect(detail().textContent).toContain(fixture.source)
  expect(detail().textContent).toContain('此模板需要参考图')
  expect(detail().textContent).toContain(fixture.instructions)
  expect(detail().querySelector('a.studio-primary')?.getAttribute('href')).toBe(
    '/studio?mode=general&inspirationId=reference-template',
  )
  await act(async () => button('关闭', detail()).click())
  expect(document.activeElement).toBe(trigger)
})

it('copies from the detail and keeps the personal prompt seed available there', async () => {
  vi.mocked(copyText).mockResolvedValue(undefined)
  await render()
  await act(async () => button(`查看${fixture.title}的提示词`).click())
  await act(async () => button('复制提示词', detail()).click())
  expect(copyText).toHaveBeenCalledWith(fixture.prompt)
  expect(detail().querySelector('[role="status"]')?.textContent).toBe('提示词已复制')
  await act(async () => button('存为私有提示词', detail()).click())
  expect(savePrompt).toHaveBeenCalledWith({
    title: fixture.title,
    prompt: fixture.prompt,
    source: fixture.source,
    favorite: true,
  })
})

it('passes the same complete template from an embedded detail dialog', async () => {
  const apply = vi.fn()
  await render(apply)
  await act(async () => button(`查看${fixture.title}的提示词`).click())
  await act(async () => button('去生图', detail()).click())
  expect(apply).toHaveBeenCalledWith(inspirationTemplate(fixture))
  expect(apply.mock.calls[0]![0]).not.toHaveProperty('imageUrl')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('shows every category inline and keeps the selected category in its original position', async () => {
  await render()
  const labels = () =>
    Array.from(categoryGroup().querySelectorAll('button'), (item) => item.textContent)
  const before = labels()
  expect(before).toEqual(['全部', ...state.categories.map((item) => item.category)])
  await act(async () => button('服装设计', categoryGroup()).click())
  expect(callbacks.changeCategory).toHaveBeenCalledWith('服装设计')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  state = { ...state, category: '服装设计', total: 3 }
  await render()
  expect(labels()).toEqual(before)
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
