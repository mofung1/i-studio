// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReferenceUploader } from './reference-uploader'
import type { CreationImage } from '@/lib/creation-images'
vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: false },
    loading: false,
    error: '',
    refresh: vi.fn(),
  }),
}))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:local-preview')
      static revokeObjectURL = vi.fn()
    },
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('opens the unified picker from the original uploader and stages dropped files once', async () => {
  const onChange = vi.fn()
  const file = new File(['image'], 'reference.png', { type: 'image/png' })
  await act(async () =>
    root.render(
      <ReferenceUploader
        files={[]}
        max={2}
        onChange={onChange}
        labelFor={(index) => `参考图 ${index + 1}`}
        emptyTitle="添加参考图片"
        emptyHint="选择本地图片或素材库"
        acceptedHint="JPG / PNG / WebP"
      />,
    ),
  )
  expect(container.querySelector('input[type="file"]')).toBeNull()
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="添加参考图片"]')!.click(),
  )
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('选择创作素材')
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('添加图片')
  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file] } })
  await act(async () => document.querySelector('.asset-picker')!.dispatchEvent(drop))
  expect(document.body.textContent).toContain('已选择 1 / 2 张')
  expect(onChange).not.toHaveBeenCalled()
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === '使用所选素材')!
      .click(),
  )
  expect(onChange).toHaveBeenCalledExactlyOnceWith([file])
  expect(fetch).not.toHaveBeenCalled()
})

it('preserves the image stack and opens each expanded list from the first image', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0))
  function Harness() {
    const [files, setFiles] = useState<CreationImage[]>(
      ['first.png', 'second.png', 'third.png'].map(
        (name) => new File(['image'], name, { type: 'image/png' }),
      ),
    )
    return (
      <ReferenceUploader
        files={files}
        onChange={setFiles}
        max={6}
        collapseAt={2}
        labelFor={(index) => `参考 ${index + 1}`}
        emptyTitle="添加参考图片"
        emptyHint="选择本地图片或素材库"
        acceptedHint="JPG / PNG / WebP"
      />
    )
  }
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
  await act(async () => root.render(<Harness />))
  expect(button('展开 3 张参考图片').getAttribute('aria-expanded')).toBe('false')
  await act(async () => button('展开 3 张参考图片').click())
  expect(container.querySelectorAll('.uploaded-thumb')).toHaveLength(3)
  const list = container.querySelector<HTMLDivElement>('.upload-list')!
  list.scrollLeft = 80
  await act(async () => button('收起参考图片').click())
  await act(async () => button('展开 3 张参考图片').click())
  expect(list.scrollLeft).toBe(0)
  await act(async () => button('删除参考 3').click())
  await act(async () => button('删除参考 2').click())
  expect(container.querySelector('.is-stackable')).toBeNull()
  expect(container.querySelectorAll('.uploaded-thumb')).toHaveLength(1)
  expect(container.querySelector('img')?.alt).toContain('first.png')
})

it('bounds commerce image stacks by their material section when no prompt grid exists', async () => {
  const observe = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe
      disconnect() {}
    },
  )
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(298)
  try {
    await act(async () =>
      root.render(
        <fieldset className="composer-media">
          <ReferenceUploader
            files={[]}
            max={6}
            collapseAt={2}
            onChange={() => {}}
            labelFor={(index) => `商品 ${index + 1}`}
            emptyTitle="商品原图"
            emptyHint="选择图片"
            acceptedHint="PNG"
          />
        </fieldset>,
      ),
    )
    expect(observe).toHaveBeenCalledWith(container.querySelector('fieldset'))
    expect(
      container
        .querySelector<HTMLElement>('.reference-uploader')
        ?.style.getPropertyValue('--reference-available-width'),
    ).toBe('298px')
  } finally {
    width.mockRestore()
  }
})
