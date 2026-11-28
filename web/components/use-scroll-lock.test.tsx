// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { lockBodyScroll, useScrollLock } from './use-scroll-lock'

function Locker({ active = true }: { active?: boolean }) {
  useScrollLock(active)
  return null
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.body.style.overflow = 'auto'
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  document.body.style.overflow = ''
  vi.unstubAllGlobals()
})

it('reference-counts scroll locks shared by multiple overlays', async () => {
  await act(async () =>
    root.render(
      <>
        <Locker />
        <Locker />
      </>,
    ),
  )
  expect(document.body.style.overflow).toBe('hidden')

  // 只关闭其中一个浮层时，页面仍保持锁定
  await act(async () => root.render(<Locker />))
  expect(document.body.style.overflow).toBe('hidden')

  await act(async () => root.render(null))
  expect(document.body.style.overflow).toBe('auto')
})

it('leaves overflow alone while inactive and releases idempotently', async () => {
  await act(async () => root.render(<Locker active={false} />))
  expect(document.body.style.overflow).toBe('auto')

  document.body.style.overflow = 'scroll'
  const release = lockBodyScroll()
  expect(document.body.style.overflow).toBe('hidden')
  release()
  release()
  expect(document.body.style.overflow).toBe('scroll')
})
