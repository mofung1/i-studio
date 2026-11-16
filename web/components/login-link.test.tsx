// @vitest-environment jsdom
import { act, useState, type AnchorHTMLAttributes } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoginLink } from './login-link'

const mocks = vi.hoisted(() => ({ push: vi.fn(), prepare: vi.fn(), ask: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio',
  useSearchParams: () => new URLSearchParams('mode=general&projectId=product-1'),
}))
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) {
          mocks.push(props.href)
          event.preventDefault()
        }
      }}
    />
  ),
}))
vi.mock('@/lib/creation-drafts', () => ({ prepareGuestDraftLogin: mocks.prepare }))
vi.mock('./use-action-confirmation', () => ({
  useActionConfirmation: () => ({ ask: mocks.ask, confirmation: null }),
}))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.push.mockReset()
  mocks.prepare.mockReset().mockResolvedValue(undefined)
  mocks.ask.mockReset().mockResolvedValue(false)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('flushes the current guest draft before navigating to login and preserves return context', async () => {
  let resolve!: () => void
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  await act(async () => root.render(<LoginLink>登录</LoginLink>))
  await act(async () => container.querySelector('a')!.click())
  expect(mocks.prepare).toHaveBeenCalledWith('/studio?mode=general&projectId=product-1')
  expect(mocks.push).not.toHaveBeenCalled()
  await act(async () => resolve())
  expect(mocks.push).toHaveBeenCalledWith(
    '/login?next=%2Fstudio%3Fmode%3Dgeneral%26projectId%3Dproduct-1',
  )
})
it('keeps the editor open when a failed save is not explicitly discarded', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('QuotaExceededError'))
  await act(async () => root.render(<LoginLink returnTo="/studio">登录</LoginLink>))
  await act(async () => container.querySelector('a')!.click())
  expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ title: '草稿尚未保存' }))
  expect(mocks.push).not.toHaveBeenCalled()
})
it('allows login after the user explicitly accepts the unsaved draft warning', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('storage unavailable'))
  mocks.ask.mockResolvedValueOnce(true)
  await act(async () => root.render(<LoginLink returnTo="/studio">登录</LoginLink>))
  await act(async () => container.querySelector('a')!.click())
  expect(mocks.push).toHaveBeenCalledWith('/login?next=%2Fstudio')
})

it('saves before invoking a dialog close callback and still navigates when that callback unmounts the link', async () => {
  let resolve!: () => void
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  const close = vi.fn()
  function ClosingDialog() {
    const [open, setOpen] = useState(true)
    return open ? (
      <LoginLink
        returnTo="/studio"
        onClick={() => {
          close()
          flushSync(() => setOpen(false))
        }}
      >
        登录
      </LoginLink>
    ) : (
      <output>弹窗已关闭</output>
    )
  }
  await act(async () => root.render(<ClosingDialog />))
  await act(async () => container.querySelector('a')!.click())
  expect(close).not.toHaveBeenCalled()
  expect(container.querySelector('a')).not.toBeNull()
  expect(mocks.push).not.toHaveBeenCalled()
  await act(async () => resolve())
  expect(close).toHaveBeenCalledOnce()
  expect(container.querySelector('a')).toBeNull()
  expect(mocks.push).toHaveBeenCalledOnce()
  expect(mocks.push).toHaveBeenCalledWith('/login?next=%2Fstudio')
})

it('keeps a dialog open when saving fails and continuing login is declined', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('storage unavailable'))
  const close = vi.fn()
  await act(async () =>
    root.render(
      <LoginLink returnTo="/studio" onClick={close}>
        登录
      </LoginLink>,
    ),
  )
  await act(async () => container.querySelector('a')!.click())
  expect(close).not.toHaveBeenCalled()
  expect(mocks.push).not.toHaveBeenCalled()
})

it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }])(
  'preserves synchronous click callbacks for modified clicks %j',
  async (modifiers) => {
    const clicked = vi.fn()
    await act(async () =>
      root.render(
        <LoginLink returnTo="/studio" onClick={clicked}>
          登录
        </LoginLink>,
      ),
    )
    await act(async () =>
      container
        .querySelector('a')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers })),
    )
    expect(clicked).toHaveBeenCalledOnce()
    expect(mocks.prepare).not.toHaveBeenCalled()
  },
)

it('preserves synchronous callbacks when opening login in a new tab', async () => {
  const clicked = vi.fn()
  await act(async () =>
    root.render(
      <LoginLink returnTo="/studio" target="_blank" onClick={clicked}>
        登录
      </LoginLink>,
    ),
  )
  await act(async () => container.querySelector('a')!.click())
  expect(clicked).toHaveBeenCalledOnce()
  expect(mocks.prepare).not.toHaveBeenCalled()
})
