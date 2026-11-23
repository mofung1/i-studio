// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ImageLightbox } from './image-lightbox'

const protectedImage = vi.hoisted(() => vi.fn())
const download = vi.hoisted(() => vi.fn())
vi.mock('@/components/authenticated-image', () => ({
  useProtectedImageUrl: protectedImage,
  downloadProtectedAsset: download,
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
  protectedImage.mockReset()
  protectedImage.mockImplementation(loadedImage)
  download.mockReset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const image = () => document.querySelector<HTMLImageElement>('.lightbox-image')
const loadedImage = (path: string) => ({ source: path, resolvedPath: path, state: 'loaded' })
const render = (path: string) =>
  root.render(<ImageLightbox path={path} alt="作品" filename="image.png" onClose={onClose} />)

async function finishImageLoad(imageElement = image()!) {
  Object.defineProperties(imageElement, {
    naturalWidth: { configurable: true, value: 1024 },
    naturalHeight: { configurable: true, value: 1024 },
  })
  await act(async () => imageElement.dispatchEvent(new Event('load')))
}

it('fits the next image instead of keeping the previous image zoom', async () => {
  await act(async () => render('/portrait.png'))
  await finishImageLoad()
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
  await finishImageLoad()
  await act(async () => button('裁剪').click())
  expect(button('裁剪并下载')).not.toBeNull()
  await act(async () => render('/long-image.png'))
  expect(document.querySelector('button[aria-label="裁剪并下载"]')).toBeNull()
  expect(button('适应窗口')).not.toBeNull()
  expect(document.querySelector('.lightbox-zoom')?.textContent).toBe('100%')
})

it('waits for the new image to draw before downloads and cropping after keyboard navigation', async () => {
  const first = '/first.png'
  const next = '/next.png'
  let fetching = true
  protectedImage.mockImplementation((path: string) =>
    path === next && fetching ? { ...loadedImage(first), state: 'loading' } : loadedImage(path),
  )
  const goNext = vi.fn(() => renderFullscreen(next))
  function renderFullscreen(path: string) {
    root.render(
      <ImageLightbox
        path={path}
        alt="作品"
        filename="image.png"
        onClose={onClose}
        onNext={goNext}
        hasNext={path === first}
        fullscreen
      />,
    )
  }

  await act(async () => renderFullscreen(first))
  const previousImage = image()!
  await finishImageLoad(previousImage)
  expect(button('下载原图').disabled).toBe(false)

  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })))
  expect(goNext).toHaveBeenCalledOnce()
  expect(image()).toBeNull()
  expect(button('下载原图').disabled).toBe(true)
  expect(button('裁剪').disabled).toBe(true)

  fetching = false
  await act(async () => renderFullscreen(next))
  expect(image()?.getAttribute('src')).toBe(next)
  expect(image()?.hidden).toBe(true)
  await finishImageLoad(previousImage)
  expect(button('下载原图').disabled).toBe(true)
  expect(button('裁剪').disabled).toBe(true)

  await finishImageLoad()
  expect(image()?.hidden).toBe(false)
  expect(button('裁剪').disabled).toBe(false)
  await act(async () => button('下载原图').click())
  expect(download).toHaveBeenCalledWith(next, 'image.png')
})

it('reloads a public image with the same source after a browser error', async () => {
  const { useProtectedImageUrl } = await vi.importActual<
    typeof import('@/components/authenticated-image')
  >('@/components/authenticated-image')
  protectedImage.mockImplementation(useProtectedImageUrl)
  const source = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='

  await act(async () => render(source))
  const failedImage = image()!
  await act(async () => failedImage.dispatchEvent(new Event('error')))
  const alert = document.querySelector('.lightbox-stage [role="alert"]')!
  expect(alert.textContent).toContain('图片加载失败')
  expect(button('下载原图').disabled).toBe(true)

  await act(async () => alert.querySelector('button')!.click())
  expect(image()).not.toBe(failedImage)
  expect(image()?.getAttribute('src')).toBe(source)
  expect(button('裁剪').disabled).toBe(true)

  await finishImageLoad()
  expect(image()?.hidden).toBe(false)
  expect(button('裁剪').disabled).toBe(false)
})
