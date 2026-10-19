// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminPagination } from './pagination'
let root: Root
let host: HTMLDivElement
const changed = vi.fn()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  changed.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
function Fixture({ total = 105 }: { total?: number }) {
  const [page, setPage] = useState(1)
  return (
    <AdminPagination
      page={page}
      pageSize={20}
      total={total}
      totalPages={Math.max(1, Math.ceil(total / 20))}
      loading={false}
      onPageSizeChange={() => {}}
      onPageChange={(next) => {
        changed(next)
        setPage(next)
      }}
    />
  )
}
async function jump(value: string) {
  host.querySelector<HTMLInputElement>('input[name="page"]')!.value = value
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
it('shows the actual record range and jumps only to valid different pages', async () => {
  await act(async () => root.render(<Fixture />))
  expect(host.textContent).toContain('第 1–20 条，共 105 条任务')
  await jump('6')
  expect(changed).toHaveBeenLastCalledWith(6)
  expect(host.textContent).toContain('第 101–105 条，共 105 条任务')
  changed.mockClear()
  for (const invalid of ['0', '7', '1.5', '', '6']) await jump(invalid)
  expect(changed).not.toHaveBeenCalled()
})
it('keeps an empty list at page one without a usable jump control', async () => {
  await act(async () => root.render(<Fixture total={0} />))
  expect(host.textContent).toContain('第 0–0 条，共 0 条任务')
  expect(host.querySelector<HTMLInputElement>('input[name="page"]')!.disabled).toBe(true)
})
