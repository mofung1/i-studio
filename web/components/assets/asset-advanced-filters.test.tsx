// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssetAdvancedFilters } from './asset-advanced-filters'
let root: Root
let container: HTMLDivElement
function Fixture() {
  const [tag, setTag] = useState('商品')
  const [from, setFrom] = useState('2026-10-01')
  const [to, setTo] = useState('')
  return (
    <>
      <AssetAdvancedFilters
        showTag
        tag={tag}
        from={from}
        to={to}
        onTag={setTag}
        onFrom={setFrom}
        onTo={setTo}
        onReset={() => {
          setTag('')
          setFrom('')
          setTo('')
        }}
      />
      <button>外部操作</button>
    </>
  )
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<Fixture />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('closes on an outside pointer, keeps changes, and supports Escape focus return', async () => {
  const details = container.querySelector('details')!
  const summary = container.querySelector('summary')!
  await act(async () => summary.click())
  expect(details.open).toBe(true)
  await act(async () =>
    container.querySelector('input')!.dispatchEvent(new Event('pointerdown', { bubbles: true })),
  )
  expect(details.open).toBe(true)
  await act(async () =>
    container
      .querySelector(':scope > button')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true })),
  )
  expect(details.open).toBe(false)
  expect(container.querySelector<HTMLInputElement>('[aria-label="筛选标签"]')?.value).toBe('商品')
  await act(async () => summary.click())
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  expect(details.open).toBe(false)
  expect(document.activeElement).toBe(summary)
})
it('places reset in the footer, resets only its fields and disables it when empty', async () => {
  await act(async () => container.querySelector('summary')!.click())
  const button = container.querySelector<HTMLButtonElement>('.asset-filter-footer button')!
  expect(container.querySelector('.asset-filter-footer')?.textContent).toContain('已设置 2 项')
  await act(async () => button.click())
  expect(button.disabled).toBe(true)
  expect(container.querySelector<HTMLInputElement>('[aria-label="筛选标签"]')?.value).toBe('')
  expect(container.querySelector<HTMLInputElement>('[aria-label="开始日期"]')?.value).toBe('')
  expect(container.querySelector('details')?.open).toBe(true)
})
