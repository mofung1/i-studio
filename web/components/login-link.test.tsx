// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoginLink } from './login-link'

const location = vi.hoisted(() => ({ search: 'mode=general' }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio',
  useSearchParams: () => new URLSearchParams(location.search),
}))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  location.search = 'mode=general'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('updates the login destination when switching tools on the same route', async () => {
  await act(async () => root.render(<LoginLink>登录</LoginLink>))
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '/login?next=%2Fstudio%3Fmode%3Dgeneral',
  )
  location.search = 'mode=commerce&task=clothing-set'
  await act(async () => root.render(<LoginLink>登录</LoginLink>))
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    `/login?next=${encodeURIComponent('/studio?mode=commerce&task=clothing-set')}`,
  )
})
it('preserves an explicit destination for private pages', async () => {
  await act(async () => root.render(<LoginLink returnTo="/assets?view=uploads">登录</LoginLink>))
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '/login?next=%2Fassets%3Fview%3Duploads',
  )
})
