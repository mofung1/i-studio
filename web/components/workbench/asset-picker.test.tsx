// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssetPicker } from './asset-picker'
const session = vi.hoisted(() => ({ authenticated: true, owner: 'customer' }))
vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: session.authenticated,
      user: session.authenticated ? { id: session.owner } : undefined,
    },
    loading: false,
    error: '',
    refresh: vi.fn(),
  }),
}))
vi.mock('./image-lightbox', () => ({
  ImageLightbox: ({ path }: { path: string }) => <div data-full-image={path} />,
}))
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
  session.authenticated = true
  session.owner = 'customer'
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:local-file')
      static revokeObjectURL = vi.fn()
    },
  )
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

const confirm = () =>
  [...document.querySelectorAll('button')].find((item) => item.textContent === '使用所选素材')!
async function chooseFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}
it('stages local and library images together in selection order without uploading', async () => {
  const onSelect = vi.fn()
  const file = new File(['local image'], 'local.png', { type: 'image/png' })
  await act(async () =>
    root.render(<AssetPicker limit={2} excludedIds={[]} onSelect={onSelect} onClose={vi.fn()} />),
  )
  await act(async () => button('first').click())
  await chooseFiles([file])
  expect(document.body.textContent).toContain('已选择 2 / 2 张')
  expect(button('second').disabled).toBe(true)
  expect(onSelect).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init || init.method === undefined)).toBe(
    true,
  )
  await act(async () => confirm().click())
  expect(onSelect.mock.calls[0]?.[0][0].assetId).toBe('first')
  expect(onSelect.mock.calls[0]?.[0][1]).toBe(file)
})
it('shows a local preview above the library immediately after choosing files', async () => {
  await act(async () =>
    root.render(<AssetPicker limit={2} excludedIds={[]} onSelect={vi.fn()} onClose={vi.fn()} />),
  )
  await chooseFiles([new File(['image'], 'visible.png', { type: 'image/png' })])
  const pending = document.querySelector('.asset-picker-pending')!
  const grid = document.querySelector('.asset-picker-grid')!
  expect(pending.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(pending.querySelector('img[alt="visible.png"]')?.getAttribute('src')).toBe(
    'blob:local-file',
  )
  expect(pending.textContent).toContain('待使用的图片 · 1 张')
  expect(pending.textContent).toContain('使用所选素材')
  await act(async () => pending.querySelector('img')!.dispatchEvent(new Event('error')))
  expect(pending.textContent).toContain('图片无法预览，请重新选择')
})
it('lets guests select local images without requesting private library data', async () => {
  session.authenticated = false
  localStorage.clear()
  const onSelect = vi.fn()
  const file = new File(['image'], 'guest.png', { type: 'image/png' })
  await act(async () =>
    root.render(<AssetPicker limit={1} excludedIds={[]} onSelect={onSelect} onClose={vi.fn()} />),
  )
  expect(document.body.textContent).toContain('登录后使用素材库')
  expect(document.querySelector('input[aria-label="搜索素材"]')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
  await chooseFiles([file])
  await act(async () => confirm().click())
  expect(onSelect).toHaveBeenCalledWith([file])
  expect(fetch).not.toHaveBeenCalled()
})
it('rejects unsupported local images and respects remaining capacity', async () => {
  const onSelect = vi.fn()
  await act(async () =>
    root.render(<AssetPicker limit={1} excludedIds={[]} onSelect={onSelect} onClose={vi.fn()} />),
  )
  await chooseFiles([new File(['gif'], 'wrong.gif', { type: 'image/gif' })])
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('JPG / PNG / WebP')
  expect(confirm().disabled).toBe(true)
  await chooseFiles([
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ])
  expect(document.body.textContent).toContain('超出的图片已忽略')
  await act(async () => confirm().click())
  expect(onSelect.mock.calls[0]?.[0]).toHaveLength(1)
})
it('removes private selections on logout while retaining staged local files', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const file = new File(['a'], 'a.png', { type: 'image/png' })
  await act(async () =>
    root.render(<AssetPicker limit={2} excludedIds={[]} onSelect={onSelect} onClose={onClose} />),
  )
  await act(async () => button('first').click())
  await chooseFiles([file])
  await act(async () => {
    session.authenticated = false
    localStorage.clear()
    root.render(<AssetPicker limit={2} excludedIds={[]} onSelect={onSelect} onClose={onClose} />)
  })
  expect(document.body.textContent).toContain('已选择 1 / 2 张')
  await act(async () => confirm().click())
  expect(onSelect).toHaveBeenCalledWith([file])
})
it('opens the original image without changing the staged selection', async () => {
  const onSelect = vi.fn()
  await act(async () =>
    root.render(<AssetPicker limit={1} excludedIds={[]} onSelect={onSelect} onClose={vi.fn()} />),
  )
  await act(async () => button('查看first大图').click())
  expect(document.querySelector('[data-full-image]')?.getAttribute('data-full-image')).toBe(
    '/v1/assets/first/content',
  )
  expect(onSelect).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('已选择 0 / 1 张')
})
