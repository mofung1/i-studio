// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GenerationFilmstrip } from './generation-filmstrip'

vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ path, alt }: { path: string; alt: string }) => (
    <img src={path} alt={alt} />
  ),
}))
let root: Root
let container: HTMLDivElement
const select = vi.fn()
const viewAll = vi.fn()
const items = [
  { id: 'older', status: 'succeeded', resultImages: ['one.png', 'two.png'] },
  {
    id: 'latest',
    status: 'failed',
    resultImages: ['three.png', 'four.png', 'five.png', 'six.png'],
  },
]
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  select.mockReset()
  viewAll.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function render() {
  await act(async () =>
    root.render(
      <GenerationFilmstrip
        items={items}
        activeIndex={1}
        activeImageIndex={3}
        onSelect={select}
        onViewAll={viewAll}
      />,
    ),
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="展开最近生成"]')!.click(),
  )
}
it('groups all result images newest first and selects the correct original version and image', async () => {
  await render()
  expect(container.querySelectorAll('img')).toHaveLength(6)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('three.png')
  expect(container.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
    '查看第 2 个版本的第 4 张',
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="查看第 1 个版本的第 2 张"]')!.click(),
  )
  expect(select).toHaveBeenCalledExactlyOnceWith(0, 1)
  expect(container.querySelectorAll('.filmstrip-partial')).toHaveLength(4)
})
it('collapses and restores the result row without changing selection or losing images', async () => {
  await render()
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="收起最近生成"]')!.click(),
  )
  expect(container.querySelector('ol')?.hidden).toBe(true)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="展开最近生成"]')!.click(),
  )
  expect(container.querySelector('ol')?.hidden).toBe(false)
  expect(container.querySelectorAll('img')).toHaveLength(6)
  expect(select).not.toHaveBeenCalled()
  await act(async () => container.querySelector<HTMLButtonElement>('.filmstrip-view-all')!.click())
  expect(viewAll).toHaveBeenCalledOnce()
})
