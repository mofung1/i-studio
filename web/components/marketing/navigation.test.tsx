// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MarketingNavigation } from './navigation'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({ account: { authenticated: false } }),
}))
vi.mock('@/components/brand', () => ({ Brand: () => <a href="/">iStudio</a> }))
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <button>主题</button> }))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<MarketingNavigation />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('focuses the first navigation link on open and returns to the trigger on Escape', async () => {
  const menu = container.querySelector<HTMLButtonElement>('.marketing-menu')!
  const firstLink = container.querySelector<HTMLAnchorElement>('nav a')!
  await act(async () => menu.click())
  expect(menu.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(firstLink)
  await act(async () => {
    firstLink.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(menu.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(menu)
})

it('closes the dropdown when keyboard focus leaves the header', async () => {
  const menu = container.querySelector<HTMLButtonElement>('.marketing-menu')!
  const outside = document.createElement('button')
  container.append(outside)
  await act(async () => menu.click())
  await act(async () => outside.focus())
  expect(menu.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(outside)
})

it('moves focus to the destination tool after a same-page menu choice', async () => {
  let afterNavigation: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    afterNavigation = callback
    return 1
  })
  const target = document.createElement('a')
  target.id = 'showcase-product-photo'
  target.href = '/studio?mode=commerce&task=product-main'
  container.append(target)
  const menu = container.querySelector<HTMLButtonElement>('.marketing-menu')!
  await act(async () => menu.click())
  // The test isolates focus from the browser's native fragment scrolling.
  document.addEventListener('click', (event) => event.preventDefault(), { once: true })
  await act(async () => container.querySelectorAll<HTMLAnchorElement>('nav a')[1]!.click())
  await act(async () => afterNavigation?.(0))
  expect(menu.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(target)
})
