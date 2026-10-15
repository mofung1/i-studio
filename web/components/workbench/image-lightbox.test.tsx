// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ImageLightbox } from './image-lightbox'

vi.mock('@/components/authenticated-image', () => ({
  useProtectedImageUrl: (path: string) => ({ source: path, state: 'loaded', retry: vi.fn() }),
}))
let root: Root
let container: HTMLDivElement
const onClose = vi.fn()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const render = (path: string) =>
  root.render(<ImageLightbox path={path} alt="作品" filename="image.png" onClose={onClose} />)

it('fits the next image instead of keeping the previous image zoom', async () => {
  await act(async () => render('/portrait.png'))
  await act(async () => button('放大').click())
  expect(document.querySelector('.lightbox-zoom')?.textContent).toBe('150%')
  await act(async () => render('/landscape.png'))
  expect(document.querySelector('.lightbox-zoom')?.textContent).toBe('100%')
  expect(document.querySelector<HTMLImageElement>('.lightbox-image')?.style.transform).toBe(
    'translate(0px, 0px) scale(1)',
  )
})
it('clears the crop state when changing images', async () => {
  await act(async () => render('/square.png'))
  await act(async () => button('裁剪').click())
  expect(button('裁剪并下载')).not.toBeNull()
  await act(async () => render('/long-image.png'))
  expect(document.querySelector('button[aria-label="裁剪并下载"]')).toBeNull()
  expect(button('适应窗口')).not.toBeNull()
  expect(document.querySelector('.lightbox-zoom')?.textContent).toBe('100%')
})
