// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssetLibrary } from '@/app/assets/asset-library'
import { PersonalPromptLibrary } from './personal-prompt-library'
const session = vi.hoisted(() => ({ loading: false }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: false },
    loading: session.loading,
    error: '',
    refresh: vi.fn(),
  }),
}))
vi.mock('./studio-shell', () => ({
  StudioShell: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <>
      {actions}
      {children}
    </>
  ),
}))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn())
  session.loading = false
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it.each(['images', 'uploads', 'tasks'] as const)(
  'shows an account gate instead of private asset controls (%s)',
  async (view) => {
    await act(async () => root.render(<AssetLibrary view={view} />))
    expect(container.textContent).toContain('登录后查看我的资产')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      `/login?next=${encodeURIComponent(`/assets?view=${view}`)}`,
    )
    expect(fetch).not.toHaveBeenCalled()
  },
)
it.each(['prompt', 'preset'] as const)(
  'keeps private prompt controls hidden from guests (%s)',
  async (kind) => {
    await act(async () => root.render(<PersonalPromptLibrary kind={kind} />))
    expect(container.textContent).toContain('登录后查看')
    expect(container.textContent).not.toContain('新增提示词')
    expect(container.querySelector('input')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  },
)
it('keeps a loading state while the account is being checked', async () => {
  session.loading = true
  await act(async () => root.render(<AssetLibrary view="uploads" />))
  expect(container.querySelector('[role="status"]')).not.toBeNull()
  expect(container.querySelector('a')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
