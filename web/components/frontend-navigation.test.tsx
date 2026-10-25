// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkbenchRail } from './workbench/workbench-rail'
import { AccountMenu } from './account-menu'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: true,
      user: { id: 'creator', username: 'creator' },
      available: 125,
      creditName: '积分',
    },
    loading: false,
  }),
}))
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it('closes mobile navigation after switching a task or pressing Escape and returns focus to the toggle', async () => {
  const changeTask = vi.fn()
  await act(async () =>
    root.render(<WorkbenchRail section="commerce" task="product-main" onChangeTask={changeTask} />),
  )
  const toggle = host.querySelector<HTMLButtonElement>('.studio-mobile-navigation-toggle')!
  await act(async () => toggle.click())
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="商品详情"]')!.click())
  expect(changeTask).toHaveBeenCalledExactlyOnceWith('detail-page')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(toggle)
  await act(async () => toggle.click())
  await act(async () =>
    host
      .querySelector('nav')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(toggle)
})
it('closes mobile navigation when focus or a pointer moves outside and preserves the desktop rail preference', async () => {
  await act(async () => root.render(<WorkbenchRail section="general" />))
  const toggle = host.querySelector<HTMLButtonElement>('.studio-mobile-navigation-toggle')!
  await act(async () => {
    toggle.focus()
    toggle.click()
  })
  await act(async () => host.dispatchEvent(new Event('pointerdown', { bubbles: true })))
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  await act(async () => toggle.click())
  const outside = document.createElement('button')
  document.body.append(outside)
  await act(async () => outside.focus())
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  outside.remove()
  await act(async () => host.querySelector<HTMLButtonElement>('.studio-rail-toggle')!.click())
  expect(localStorage.getItem('istudio-rail-collapsed')).toBe('true')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  document.documentElement.removeAttribute('data-studio-rail')
})
it('supports arrow, Home, End and Escape keys in the account menu', async () => {
  await act(async () => root.render(<AccountMenu />))
  const toggle = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!
  await act(async () => toggle.click())
  const menu = host.querySelector<HTMLElement>('[role="menu"]')!
  const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  expect(document.activeElement).toBe(items[0])
  async function key(value: string) {
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true }),
      ),
    )
  }
  await key('ArrowDown')
  expect(document.activeElement).toBe(items[1])
  await key('ArrowDown')
  expect(document.activeElement).toBe(items[2])
  await key('ArrowDown')
  expect(document.activeElement).toBe(items[0])
  await key('End')
  expect(document.activeElement).toBe(items[2])
  await key('Home')
  expect(document.activeElement).toBe(items[0])
  await key('Escape')
  expect(host.querySelector('[role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(toggle)
})
