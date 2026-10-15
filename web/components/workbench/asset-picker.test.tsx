// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssetPicker } from './asset-picker'
vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}))
let root: Root
let container: HTMLDivElement
const asset = (id: string) => ({
  id,
  title: id,
  mime: 'image/png',
  sizeBytes: 100,
  width: 800,
  height: 600,
  contentPath: `/v1/assets/${id}/content`,
  thumbnailPath: `/v1/assets/${id}/thumbnail`,
})
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-access-token', 'session')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/projects')
              ? { projects: [] }
              : {
                  assets: url.includes('kind=generated')
                    ? [asset('generated')]
                    : [asset('already-added'), asset('first'), asset('second')],
                  nextCursor: '',
                },
          ),
        ),
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
it('enforces remaining slots and confirms staged selections only when requested', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  await act(async () =>
    root.render(
      <AssetPicker
        limit={1}
        excludedIds={['already-added']}
        onSelect={onSelect}
        onClose={onClose}
      />,
    ),
  )
  expect(button('已添加：already-added').disabled).toBe(true)
  await act(async () => button('first').click())
  expect(button('second').disabled).toBe(true)
  expect(onSelect).not.toHaveBeenCalled()
  const confirm = [...document.querySelectorAll('button')].find(
    (item) => item.textContent === '使用所选素材',
  )!
  await act(async () => confirm.click())
  expect(onSelect.mock.calls[0]?.[0][0].assetId).toBe('first')
  expect(onClose).toHaveBeenCalledOnce()
})
it('retains selection across source tabs and cancels without applying', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  await act(async () =>
    root.render(<AssetPicker limit={2} excludedIds={[]} onSelect={onSelect} onClose={onClose} />),
  )
  await act(async () => button('first').click())
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((item) => item.textContent === '生成作品')!
      .click(),
  )
  await act(async () => button('generated').click())
  expect(document.body.textContent).toContain('已选择 2 / 2 张')
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!.click(),
  )
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})
