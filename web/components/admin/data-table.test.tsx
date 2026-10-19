// @vitest-environment jsdom
import { Button } from '@/components/admin/ui/button'
import { OverlayRoot } from '../overlay-root'
import { act, useState } from 'react'
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
}: {
  data?: Item[]
  loading?: boolean
  page?: number
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
  await act(async () =>
    root.render(
      <OverlayRoot className="admin-shell">
        <Fixture {...props} />
      </OverlayRoot>,
    ),
  )
}

it('cycles controlled sorting without sorting an already paginated response locally', async () => {
  await render()
  const button = heading().querySelector('button')!
  await act(async () => button.click())
  expect(sorted).toHaveBeenLastCalledWith([{ id: 'amount', desc: false }])
  expect(heading().getAttribute('aria-sort')).toBe('ascending')
  expect(container.querySelector('tbody tr')?.textContent).toContain('Alice')
  await act(async () => button.click())
  expect(heading().getAttribute('aria-sort')).toBe('descending')
  await act(async () => button.click())
  expect(sorted).toHaveBeenLastCalledWith([])
  expect(heading().getAttribute('aria-sort')).toBe('none')
})

it('lets users hide optional columns and restore them while preserving fixed identity and action columns', async () => {
  await render()
  await openColumns()
  const checkbox = container.querySelector<HTMLElement>('[aria-label="显示余额"]')!
  expect(container.querySelector('[aria-label="显示账号"]')!.getAttribute('aria-disabled')).toBe(
    'true',
  )
  expect(container.querySelector('[aria-label="显示操作"]')!.getAttribute('aria-disabled')).toBe(
    'true',
  )
  await act(async () => checkbox.click())
  expect(container.querySelectorAll('thead th')).toHaveLength(2)
  expect(container.querySelector('tbody')?.textContent).not.toContain('900')
  expect(container.querySelectorAll('tbody button')).toHaveLength(2)
  const restore = [...container.querySelectorAll<HTMLElement>('[role=menuitem]')].find(
    (button) => button.textContent === '恢复默认列',
  )!
  await act(async () => restore.click())
  expect(container.querySelectorAll('thead th')).toHaveLength(3)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="紧凑行距"]')!.click(),
  )
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
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="测试列表列设置"]')!
  trigger.focus()
  await act(async () =>
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  )
  return trigger
}
it('dismisses the accessible column menu with Escape and restores focus', async () => {
  await render()
  const trigger = await openColumns()
  expect(container.querySelector('[role="menu"]')).not.toBeNull()
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  )
  expect(container.querySelector('[role="menu"]')).toBeNull()
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
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="紧凑行距"]')!.click(),
  )
  const saved = JSON.parse(localStorage.getItem('istudio-admin-table:测试列表')!)
  expect(saved).toEqual({ density: 'compact', visibility: { amount: false } })
})
