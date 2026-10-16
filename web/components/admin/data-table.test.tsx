// @vitest-environment jsdom
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
  { id: 'actions', header: '操作', pin: 'right', cell: () => <button>编辑</button> },
]
const sorted = vi.fn()
let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  sorted.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
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
  await act(async () => root.render(<Fixture {...props} />))
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
  const checkbox = container.querySelector<HTMLInputElement>('[aria-label="显示余额"]')!
  expect(container.querySelector<HTMLInputElement>('[aria-label="显示账号"]')!.disabled).toBe(true)
  expect(container.querySelector<HTMLInputElement>('[aria-label="显示操作"]')!.disabled).toBe(true)
  await act(async () => checkbox.click())
  expect(container.querySelectorAll('thead th')).toHaveLength(2)
  expect(container.querySelector('tbody')?.textContent).not.toContain('900')
  expect(container.querySelectorAll('tbody button')).toHaveLength(2)
  const restore = [...container.querySelectorAll('button')].find(
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

it('dismisses the column menu with Escape and restores focus to its trigger', async () => {
  await render()
  const details = container.querySelector('details')!
  details.open = true
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(details.open).toBe(false)
  expect(document.activeElement).toBe(details.querySelector('summary'))
})
