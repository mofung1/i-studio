// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { adminRequest } from '@/lib/admin'
import { InspirationCategoryManager } from './inspiration-category-manager'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn() }))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-admin-token', 'operator')
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  })
  vi.mocked(adminRequest).mockResolvedValue({
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
  const list = container.querySelector<HTMLElement>('.admin-data-scroll')!
  expect(list.querySelectorAll('tbody > tr')).toHaveLength(20)
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
  expect(list.querySelectorAll('tbody > tr')).toHaveLength(1)
  expect(list.textContent).toContain('分类-51')
  expect(container.textContent).toContain('第 1 / 1 页')
})

it('sorts the complete category collection before selecting a page', async () => {
  await act(async () => root.render(<InspirationCategoryManager />))
  const sort = [...container.querySelectorAll('thead button')].find(
    (button) => button.textContent === '提示词数量',
  ) as HTMLButtonElement
  await act(async () => sort.click())
  await act(async () => sort.click())
  expect(container.querySelector('tbody tr')?.textContent).toContain('分类-51')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="下一页分类"]')!.click(),
  )
  expect(container.querySelector('tbody tr')?.textContent).toContain('分类-31')
})
