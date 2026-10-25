// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Page from '@/app/admin/inspiration/page'
import { adminRequest } from '@/lib/admin'
import type {
  ManagedInspirationCategory,
  ManagedInspirationPrompt,
} from '@/lib/inspiration-settings'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn() }))

let root: Root
let container: HTMLDivElement
let categories: ManagedInspirationCategory[]
let prompts: ManagedInspirationPrompt[]

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    },
  })
  localStorage.setItem('istudio-admin-token', 'operator')
  window.history.replaceState(null, '', '/admin/inspiration')
  categories = [
    { id: 'c1', category: '产品摄影', count: 61, enabledCount: 61 },
    { id: 'c2', category: '人像', count: 0, enabledCount: 0 },
  ]
  prompts = Array.from({ length: 61 }, (_, index) => ({
    id: String(index + 1),
    title: `提示词-${String(index + 1).padStart(2, '0')}`,
    category: '产品摄影',
    prompt: '自然光，简洁的背景',
    source: '',
    imageUrl: '',
    width: 1024,
    height: 1024,
    sortOrder: index,
    enabled: true,
  }))
  vi.mocked(adminRequest).mockReset()
  vi.mocked(adminRequest).mockImplementation(async (path, method = 'GET', body) => {
    if (path.startsWith('inspiration/prompts?')) {
      const params = new URLSearchParams(path.split('?')[1])
      const query = params.get('q') ?? ''
      const category = params.get('category') ?? ''
      const filtered = prompts.filter(
        (row) => row.title.includes(query) && (!category || row.category === category),
      )
      const pageSize = Number(params.get('pageSize'))
      const page = Math.min(
        Number(params.get('page')),
        Math.max(1, Math.ceil(filtered.length / pageSize)),
      )
      return {
        prompts: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        page,
        pageSize,
      }
    }
    if (path.startsWith('inspiration/categories?'))
      return { categories: categories.map((row) => ({ ...row })) }
    if (method === 'POST' && path === 'inspiration/categories') {
      const category = {
        id: 'new',
        category: (body as { name: string }).name,
        count: 0,
        enabledCount: 0,
      }
      categories.push(category)
      return { category }
    }
    if (method === 'PUT' && path === 'inspiration/categories/c1') {
      const name = (body as { name: string }).name
      const oldName = categories[0]!.category
      categories[0] = { ...categories[0]!, category: name }
      prompts = prompts.map((row) => (row.category === oldName ? { ...row, category: name } : row))
      return { category: categories[0] }
    }
    if (method === 'DELETE' && path === 'inspiration/categories/c1') {
      const target = categories.find((row) => row.id === (body as { moveToId: string }).moveToId)!
      const removed = categories.find((row) => row.id === 'c1')!
      prompts = prompts.map((row) =>
        row.category === removed.category ? { ...row, category: target.category } : row,
      )
      categories = categories.filter((row) => row.id !== 'c1')
      return { movedCount: removed.count }
    }
    throw new Error(`unexpected request: ${method} ${path}`)
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
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

function button(label: string, scope: ParentNode = container) {
  const match = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) =>
      element.getAttribute('aria-label') === label || element.textContent?.trim() === label,
  )
  if (!match) throw new Error(`未找到按钮：${label}`)
  return match
}

async function click(label: string, scope?: ParentNode) {
  await act(async () => {
    const target = button(label, scope)
    target.focus()
    target.click()
  })
}

async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit(form: HTMLFormElement) {
  await act(async () =>
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}

async function openSelect(label: string) {
  await act(async () =>
    container
      .querySelector(`[role="combobox"][aria-label="${label}"]`)!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      ),
  )
  return document.querySelector<HTMLElement>('[role="listbox"]')!
}

async function select(label: string, option: string) {
  const menu = await openSelect(label)
  const match = [...menu.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (element) => element.textContent?.trim() === option,
  )!
  await act(async () => match.click())
}

it('keeps pagination in the library layout and applies page size and search to the server query', async () => {
  await act(async () => root.render(<Page />))
  expect(container.children).toHaveLength(1)
  expect(container.firstElementChild?.classList.contains('admin-list-page')).toBe(true)
  expect(container.querySelector('a[href="/inspire"]')).toBeNull()
  const pagination = container.querySelector('[aria-label="提示词分页"]')!
  expect(pagination.parentElement).toBe(container.firstElementChild)
  const list = container.querySelector<HTMLElement>('.admin-data-scroll')!
  expect(list.querySelectorAll('tbody > tr')).toHaveLength(20)
  list.scrollTop = 300
  await click('下一页提示词')
  expect(list.scrollTop).toBe(0)
  expect(list.querySelector('tbody tr')?.textContent).toContain('提示词-21')
  expect(pagination.textContent).toContain('第 2 / 4 页')
  await select('每页提示词条数', '50 条 / 页')
  expect(list.querySelectorAll('tbody > tr')).toHaveLength(50)
  expect(pagination.textContent).toContain('第 1 / 2 页')
  await change(container.querySelector('[aria-label="搜索管理提示词"]')!, '提示词-61')
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 400)))
  expect(list.querySelectorAll('tbody > tr')).toHaveLength(1)
  expect(list.textContent).toContain('提示词-61')
  expect(pagination.textContent).toContain('第 1 / 1 页')
})

it('manages categories in a modal and makes new categories available in the prompt editor', async () => {
  await act(async () => root.render(<Page />))
  await click('分类管理')
  const dialog = container.querySelector<HTMLDialogElement>('.inspiration-category-dialog')!
  expect(dialog.open).toBe(true)
  const menu = await openSelect('每页分类条数')
  expect(menu.closest('dialog')).toBe(dialog)
  await act(async () =>
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  await change(dialog.querySelector('#inspiration-new-category')!, '建筑')
  await submit(dialog.querySelector('.inspiration-category-create')!)
  expect(dialog.querySelector('tbody')?.textContent).toContain('建筑')
  await click('关闭分类管理')
  expect(container.querySelector('.inspiration-category-dialog')).toBeNull()
  expect(document.activeElement).toBe(button('分类管理'))
  await click('新增提示词')
  const categoryMenu = await openSelect('提示词分类')
  expect(categoryMenu.textContent).toContain('建筑')
  expect(categoryMenu.closest('dialog')?.classList.contains('inspiration-editor-dialog')).toBe(true)
})

it('keeps the active category when renamed and clears the filter after migration and deletion', async () => {
  await act(async () => root.render(<Page />))
  await select('提示词分类筛选', '产品摄影')
  await click('分类管理')
  await click('改名 产品摄影')
  const rename = container.querySelector<HTMLInputElement>('[aria-label="重命名 产品摄影"]')!
  await change(rename, '商品摄影')
  expect(container.querySelector('[aria-label="重命名 产品摄影"]')).toBe(rename)
  expect(document.activeElement).toBe(rename)
  await submit(rename.closest('form')!)
  expect(container.querySelector('[aria-label="提示词分类筛选"]')?.textContent).toContain(
    '商品摄影',
  )
  expect(container.querySelector('main .admin-data-scroll')?.textContent).toContain('商品摄影')
  await click('删除分类 商品摄影')
  const nested = container.querySelector<HTMLDialogElement>('.inspiration-category-delete-dialog')!
  await act(async () => nested.dispatchEvent(new Event('cancel', { cancelable: true })))
  expect(nested.open).toBe(false)
  expect(container.querySelector<HTMLDialogElement>('.inspiration-category-dialog')?.open).toBe(
    true,
  )
  await click('删除分类 商品摄影')
  await select('接收提示词的分类', '人像')
  await click('迁移并删除分类')
  await click('关闭分类管理')
  expect(container.querySelector('[aria-label="提示词分类筛选"]')?.textContent).toContain(
    '全部分类',
  )
  expect(container.querySelector('tbody')?.textContent).toContain('人像')
})

it('closes unsaved category input directly without browser confirmation', async () => {
  window.history.replaceState(null, '', '/admin/inspiration?categories=1')
  await act(async () => root.render(<Page />))
  const dialog = container.querySelector<HTMLDialogElement>('.inspiration-category-dialog')!
  expect(dialog.open).toBe(true)
  await change(dialog.querySelector('#inspiration-new-category')!, '尚未保存')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('关闭分类管理')
  expect(confirm).not.toHaveBeenCalled()
  expect(container.querySelector('.inspiration-category-dialog')).toBeNull()
  expect(window.location.search).toBe('')
})
