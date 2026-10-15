// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssetImageCover } from './asset-image-cover'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-access-token', 'cover-session')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
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

it('keeps image retry separate from opening the preview', async () => {
  const onOpen = vi.fn()
  await act(async () =>
    root.render(
      <AssetImageCover path="/v1/assets/failed-cover/thumbnail" alt="商品长图" onOpen={onOpen} />,
    ),
  )
  expect(container.querySelector('button button')).toBeNull()
  const retry = container.querySelector<HTMLButtonElement>('button[aria-label="重试加载商品长图"]')!
  expect(retry).not.toBeNull()
  await act(async () => retry.click())
  expect(onOpen).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(2)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="查看 商品长图"]')!.click(),
  )
  expect(onOpen).toHaveBeenCalledOnce()
})
