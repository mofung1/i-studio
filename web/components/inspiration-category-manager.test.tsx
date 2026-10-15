// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { settingsRequest } from '@/lib/ai-settings'
import { InspirationCategoryManager } from './inspiration-category-manager'

vi.mock('@/lib/ai-settings', () => ({ settingsRequest: vi.fn() }))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-admin-token', 'operator')
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  })
  vi.mocked(settingsRequest).mockResolvedValue({
    categories: Array.from({ length: 51 }, (_, n) => ({
      id: String(n + 1),
      category: `分类-${String(n + 1).padStart(2, '0')}`,
      count: n,
      enabledCount: n,
    })),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

it('paginates categories, resets scrolling on page changes and searches all categories', async () => {
  await act(async () => root.render(<InspirationCategoryManager />))
  const list = container.querySelector<HTMLElement>('.inspiration-category-list')!
  expect(list.querySelectorAll('article')).toHaveLength(20)
  expect(list.textContent).toContain('分类-01')
  expect(list.textContent).not.toContain('分类-21')
  list.scrollTop = 300
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="下一页分类"]')!.click(),
  )
  expect(list.scrollTop).toBe(0)
  expect(list.textContent).toContain('分类-21')
  expect(container.textContent).toContain('第 2 / 3 页')
  const search = container.querySelector<HTMLInputElement>('[aria-label="搜索灵感分类"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      search,
      '分类-51',
    )
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(list.querySelectorAll('article')).toHaveLength(1)
  expect(list.textContent).toContain('分类-51')
  expect(container.textContent).toContain('第 1 / 1 页')
})
