// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ImmersiveShell } from './immersive-shell'

vi.mock('./account-menu', () => ({ AccountMenu: () => <div data-testid="account" /> }))
vi.mock('./brand', () => ({ Brand: () => <span>iStudio</span> }))
vi.mock('./theme-toggle', () => ({ ThemeToggle: () => <button type="button">主题</button> }))
vi.mock('./workbench/workbench-rail', () => ({
  WorkbenchRail: ({ section }: { section: string }) => <nav>{section}</nav>,
}))

const show = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open')
})

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: show,
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close })
  show.mockClear()
  close.mockClear()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  vi.unstubAllGlobals()
})

it('shares the body scroll lock instead of locking the document element', async () => {
  await act(async () =>
    root.render(
      <ImmersiveShell section="home">
        <div>首页内容</div>
      </ImmersiveShell>,
    ),
  )
  expect(document.body.style.overflow).toBe('')

  const menu = container.querySelector<HTMLButtonElement>('[aria-label="打开工作台导航"]')!
  await act(async () => menu.click())
  expect(show).toHaveBeenCalledOnce()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.documentElement.style.overflow).toBe('')

  const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="关闭工作台导航"]')!
  await act(async () => closeButton.click())
  expect(close).toHaveBeenCalled()
  expect(document.body.style.overflow).toBe('')
})
