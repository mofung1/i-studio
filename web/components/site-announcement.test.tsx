// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SiteAnnouncement } from './site-announcement'
const navigation = vi.hoisted(() => ({ path: '/studio' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.path }))
let root: Root, container: HTMLDivElement
const fetcher = vi.fn<typeof fetch>()
const show = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open')
})
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetcher)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: show,
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close })
  fetcher.mockReset()
  show.mockClear()
  close.mockClear()
  localStorage.clear()
  navigation.path = '/studio'
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
it('renders announcement text safely, remembers dismissal, and still permits reopening', async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        announcement: { id: 'v1', title: '维护公告', content: '第一行\n<script>alert(1)</script>' },
      }),
    ),
  )
  await act(async () => root.render(<SiteAnnouncement />))
  expect(show).toHaveBeenCalledTimes(1)
  expect(container.querySelector('script')).toBeNull()
  expect(container.textContent).toContain('<script>alert(1)</script>')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="关闭公告"]')!.click(),
  )
  expect(localStorage.getItem('istudio-announcement-seen')).toBe('v1')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="查看网站公告"]')!.click(),
  )
  expect(show).toHaveBeenCalledTimes(2)
})
it('does not publish drafts or fetch announcements in the admin realm and prompts for a new content version', async () => {
  navigation.path = '/admin/operations'
  await act(async () => root.render(<SiteAnnouncement />))
  expect(fetcher).not.toHaveBeenCalled()
  localStorage.setItem('istudio-announcement-seen', 'v1')
  navigation.path = '/studio'
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ announcement: { id: 'v2', title: '新公告', content: '更新后的正文' } }),
    ),
  )
  await act(async () => root.render(<SiteAnnouncement />))
  expect(show).toHaveBeenCalledTimes(1)
  expect(container.textContent).toContain('新公告')
  navigation.path = '/admin'
  await act(async () => root.render(<SiteAnnouncement />))
  navigation.path = '/'
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ announcement: null })))
  await act(async () => root.render(<SiteAnnouncement />))
  expect(container.querySelector('dialog')).toBeNull()
})
