// @vitest-environment jsdom
import { Button } from '@/components/admin/ui/button'
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AdminDataTable, type AdminColumn, type AdminSorting } from './data-table'

type Item = { id: string; name: string; amount: number }
const items: Item[] = [
  { id: 'a', name: 'Alice', amount: 900 },
  { id: 'b', name: 'Bob', amount: 125 },
]
const columns: AdminColumn<Item>[] = [
  { id: 'name', header: '账号', pin: 'left', cell: (item) => item.name },
  { id: 'amount', header: '余额', sortable: true, cell: (item) => item.amount },
  {
    id: 'actions',
    header: '操作',
    pin: 'right',
    cell: () => <Button variant="outline">编辑</Button>,
  },
]
const sorted = vi.fn()
let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  sorted.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function Fixture({
  data = items,
  loading = false,
  page = 1,
  emptyAction,
}: {
  data?: Item[]
  loading?: boolean
  page?: number
  emptyAction?: ReactNode
}) {
  const [sorting, setSorting] = useState<AdminSorting>([])
  return (
    <AdminDataTable
      title="测试列表"
      columns={columns}
      data={data}
      getRowId={(item) => item.id}
      loading={loading}
      scrollKey={page}
      emptyAction={emptyAction}
      sorting={sorting}
      onSortingChange={(value) => {
        sorted(value)
        setSorting(value)
      }}
    />
  )
}
function heading() {
  return container.querySelector<HTMLTableCellElement>('th[aria-sort]')!
}
async function render(props: Parameters<typeof Fixture>[0] = {}) {
  await act(async () => root.render(<Fixture {...props} />))
}

async function openMenu(trigger: HTMLButtonElement) {
  trigger.focus()
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  )
  return trigger
}

async function chooseMenuItem(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (entry) => entry.textContent === label,
  )
  expect(item, label).toBeDefined()
  await act(async () => item!.click())
  // Radix returns focus to the trigger after unmounting its portal.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function sortBy(label: string) {
  await openMenu(heading().querySelector('button')!)
  await chooseMenuItem(label)
}

it('sets and clears server sorting without reordering a paginated response locally', async () => {
  await render()
  await sortBy('升序排列')
  expect(sorted).toHaveBeenLastCalledWith([{ id: 'amount', desc: false }])
  expect(heading().getAttribute('aria-sort')).toBe('ascending')
  expect(container.querySelector('tbody tr')?.textContent).toContain('Alice')
  await sortBy('降序排列')
  expect(heading().getAttribute('aria-sort')).toBe('descending')
  await sortBy('清除排序')
  expect(sorted).toHaveBeenLastCalledWith([])
  expect(heading().getAttribute('aria-sort')).toBe('none')
})

it('lets users hide optional columns and restore them while preserving fixed identity and action columns', async () => {
  await render()
  await openColumns()
  const checkbox = document.querySelector<HTMLElement>('[aria-label="显示余额"]')!
  expect(document.querySelector('[aria-label="显示账号"]')!.getAttribute('aria-disabled')).toBe(
    'true',
  )
  expect(document.querySelector('[aria-label="显示操作"]')!.getAttribute('aria-disabled')).toBe(
    'true',
  )
  await act(async () => checkbox.click())
  expect(container.querySelectorAll('thead th')).toHaveLength(2)
  expect(container.querySelector('tbody')?.textContent).not.toContain('900')
  expect(container.querySelectorAll('tbody button')).toHaveLength(2)
  await chooseMenuItem('恢复默认列')
  expect(container.querySelectorAll('thead th')).toHaveLength(3)
  await openColumns()
  await act(async () => document.querySelector<HTMLElement>('[aria-label="紧凑行距"]')!.click())
  expect(container.querySelector('.admin-data-table')?.getAttribute('data-density')).toBe('compact')
  expect(sorted).not.toHaveBeenCalled()
})

it('keeps rows and scroll position while refreshing, and resets scrolling on a different page', async () => {
  await render()
  const scroll = container.querySelector<HTMLElement>('.admin-data-scroll')!
  scroll.scrollTop = 200
  await render({ loading: true })
  expect(scroll.scrollTop).toBe(200)
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(heading().querySelector('button')!.disabled).toBe(true)
  await render({ page: 2 })
  expect(scroll.scrollTop).toBe(0)
  await render({ data: [], loading: true })
  expect(container.querySelector('.admin-data-empty')).toBeNull()
  expect(container.querySelectorAll('.admin-data-skeleton-row')).toHaveLength(5)
  await render({ data: [] })
  expect(container.querySelector('[role="status"]')?.textContent).toContain('暂无记录')
})

async function openColumns() {
  return openMenu(container.querySelector<HTMLButtonElement>('[aria-label="测试列表显示设置"]')!)
}
it('dismisses the accessible column menu with Escape and restores focus', async () => {
  await render()
  const trigger = await openColumns()
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  )
  expect(document.querySelector('[role="menu"]')).toBeNull()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(document.activeElement).toBe(trigger)
})
it('restores saved table preferences without hiding pinned columns and persists changes', async () => {
  localStorage.setItem(
    'istudio-admin-table:测试列表',
    JSON.stringify({
      density: 'comfortable',
      visibility: { name: false, amount: false, actions: false, unknown: false },
    }),
  )
  await render()
  expect(container.querySelectorAll('thead th')).toHaveLength(2)
  expect(container.textContent).toContain('Alice')
  expect(container.querySelector('.admin-data-table')?.getAttribute('data-density')).toBe(
    'comfortable',
  )
  await openColumns()
  await act(async () => document.querySelector<HTMLElement>('[aria-label="紧凑行距"]')!.click())
  const saved = JSON.parse(localStorage.getItem('istudio-admin-table:测试列表')!)
  expect(saved).toEqual({ density: 'compact', visibility: { amount: false } })
})

it('keeps the active server sort discoverable after hiding that column and can reset it', async () => {
  await render()
  await sortBy('升序排列')
  await openColumns()
  await act(async () => document.querySelector<HTMLElement>('[aria-label="显示余额"]')!.click())
  expect(container.querySelector('th[aria-sort]')).toBeNull()
  expect(container.textContent).toContain('按余额升序排列')
  await chooseMenuItem('恢复默认排序')
  expect(sorted).toHaveBeenLastCalledWith([])
  expect(container.textContent).not.toContain('按余额升序排列')
})

it('reveals horizontal navigation and releases pinned columns in a narrow table viewport', async () => {
  await render()
  const scroll = container.querySelector<HTMLElement>('.admin-data-scroll')!
  Object.defineProperties(scroll, {
    clientWidth: { value: 350, configurable: true },
    scrollWidth: { value: 900, configurable: true },
  })
  const scrollBy = vi.fn(({ left }: { left: number }) => {
    scroll.scrollLeft = Math.min(550, Math.max(0, scroll.scrollLeft + left))
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  Object.defineProperty(scroll, 'scrollBy', { value: scrollBy, configurable: true })
  await act(async () => window.dispatchEvent(new Event('resize')))
  expect(container.querySelector('td[data-pin]')).toBeNull()
  expect(container.querySelector('th[data-pin]')).toBeNull()
  expect(scroll.getAttribute('aria-describedby')).toBeTruthy()
  const left = container.querySelector<HTMLButtonElement>('[aria-label="向左滚动测试列表"]')!
  const right = container.querySelector<HTMLButtonElement>('[aria-label="向右滚动测试列表"]')!
  expect(left.disabled).toBe(true)
  expect(right.disabled).toBe(false)
  await act(async () => right.click())
  expect(scrollBy).toHaveBeenCalledWith({ left: 262.5 })
  expect(left.disabled).toBe(false)
  await act(async () => {
    scroll.scrollLeft = 550
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  expect(right.disabled).toBe(true)
  Object.defineProperty(scroll, 'clientWidth', { value: 750, configurable: true })
  await act(async () => window.dispatchEvent(new Event('resize')))
  expect(container.querySelector('td[data-pin="left"]')).not.toBeNull()
  Object.defineProperty(scroll, 'clientWidth', { value: 900, configurable: true })
  await act(async () => window.dispatchEvent(new Event('resize')))
  expect(container.querySelector('.admin-data-scroll-help')).toBeNull()
  expect(container.querySelector('td[data-pin]')).toBeNull()
  expect(scroll.getAttribute('aria-describedby')).toBeNull()
})

it('shows the empty-state action only once loading has completed', async () => {
  const emptyAction = <a href="/admin/settings">添加服务</a>
  await render({ data: [], loading: true, emptyAction })
  expect(container.querySelector('a')).toBeNull()
  await render({ data: [], emptyAction })
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/settings')
  expect(container.querySelector('.admin-data-scroll')?.getAttribute('data-empty')).toBe('true')
})
