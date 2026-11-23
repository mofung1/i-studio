// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReferenceUploader } from './reference-uploader'
import { maxCreationImageSize, type CreationImage } from '@/lib/creation-images'
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

it('returns focus to the first newly selected thumbnail, or to the trigger on cancel', async () => {
  function ProductImages() {
    const [files, setFiles] = useState<CreationImage[]>([])
    return (
      <ReferenceUploader
        files={files}
        onChange={setFiles}
        max={3}
        collapseAt={2}
        labelFor={(index) => `商品图 ${index + 1}`}
        emptyTitle="上传商品原图"
        emptyHint="选择本地图片或素材库"
        acceptedHint="PNG"
      />
    )
  }
  async function openPicker(label: string) {
    const trigger = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    await act(async () => {
      trigger.focus()
      trigger.click()
    })
    return trigger
  }
  async function confirmFiles(...names: string[]) {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: names.map((name) => new File(['image'], name, { type: 'image/png' })),
    })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    const confirm = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === '使用所选素材',
    )!
    await act(async () => {
      confirm.focus()
      confirm.click()
    })
  }
  function expectFocusedThumbnail(filename: string) {
    const thumbnail = container.querySelector(`img[alt$="${filename}"]`)!.closest('.uploaded-thumb')
    expect(document.activeElement).toBe(thumbnail)
    expect(thumbnail!.closest('[inert]')).toBeNull()
  }

  await act(async () => root.render(<ProductImages />))
  const trigger = await openPicker('上传商品原图')
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  )
  expect(document.activeElement).toBe(trigger)
  await openPicker('上传商品原图')
  await confirmFiles('product.png')
  expectFocusedThumbnail('product.png')
  await openPicker('添加图片')
  await confirmFiles('side.png', 'detail.png')
  expect(container.querySelectorAll('.uploaded-thumb')).toHaveLength(3)
  expectFocusedThumbnail('side.png')
  await openPicker('替换商品图 3')
  await confirmFiles('updated.png')
  expectFocusedThumbnail('updated.png')
})

it('adds local recipe images directly, validates them, and focuses the first new thumbnail', async () => {
  function RecipeImages() {
    const [files, setFiles] = useState<CreationImage[]>([])
    return (
      <ReferenceUploader
        directLocalSelection
        files={files}
        onChange={setFiles}
        max={3}
        collapseAt={2}
        labelFor={(index) => `商品图 ${index + 1}`}
        emptyTitle="上传商品原图"
        emptyHint="选择本地图片或素材库"
        acceptedHint="JPG / PNG / WebP"
      />
    )
  }

  await act(async () => root.render(<RecipeImages />))
  const localButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === '从本机选图',
  )!
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  const nativeClick = vi.spyOn(input, 'click')
  await act(async () => {
    localButton.focus()
    localButton.click()
  })
  expect(nativeClick).toHaveBeenCalledOnce()
  expect(input.multiple).toBe(true)
  expect(document.querySelector('[role="dialog"]')).toBeNull()

  const invalid = new File(['image'], 'invalid.svg', { type: 'image/svg+xml' })
  const tooLarge = new File(['image'], 'large.png', { type: 'image/png' })
  Object.defineProperty(tooLarge, 'size', { value: maxCreationImageSize + 1 })
  Object.defineProperty(input, 'files', {
    value: [
      invalid,
      new File(['image'], 'front.png', { type: 'image/png' }),
      tooLarge,
      new File(['image'], 'side.webp', { type: 'image/webp' }),
    ],
  })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('单张不超过 10 MB')
  const thumbnails = [...container.querySelectorAll('.uploaded-thumb')]
  expect(thumbnails).toHaveLength(2)
  expect(thumbnails[0].querySelector('img')?.alt).toContain('front.png')
  expect(thumbnails[1].querySelector('img')?.alt).toContain('side.webp')
  expect(document.activeElement).toBe(thumbnails[0])
  expect(thumbnails[0].closest('[inert]')).toBeNull()
  expect(input.multiple).toBe(false)

  const libraryButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === '从素材库选',
  )!
  await act(async () => {
    libraryButton.focus()
    libraryButton.click()
  })
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('选择创作素材')
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  )
  expect(document.activeElement).toBe(libraryButton)

  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', {
    value: {
      types: ['Files'],
      files: [
        new File(['image'], 'angle.jpg', { type: 'image/jpeg' }),
        new File(['image'], 'extra.jpg', { type: 'image/jpeg' }),
      ],
    },
  })
  await act(async () => container.querySelector('.reference-uploader')!.dispatchEvent(drop))
  expect(container.querySelectorAll('.uploaded-thumb')).toHaveLength(3)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('最多 3 张')
  expect(container.querySelector('img[alt$="extra.jpg"]')).toBeNull()
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

it('blocks additional images for text-only models while preserving existing image removal', async () => {
  const file = new File(['image'], 'kept.png', { type: 'image/png' })
  const onChange = vi.fn()
  const render = (files: CreationImage[]) => (
    <ReferenceUploader
      files={files}
      onChange={onChange}
      max={6}
      labelFor={() => '原参考'}
      emptyTitle="添加参考图片"
      emptyHint="请选择图片"
      acceptedHint="PNG"
      disabledReason="当前模型不支持图片输入"
    />
  )
  await act(async () => root.render(render([])))
  expect(container.querySelector<HTMLButtonElement>('[aria-label="添加参考图片"]')?.disabled).toBe(
    true,
  )
  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file] } })
  await act(async () => container.querySelector('.reference-uploader')!.dispatchEvent(drop))
  expect(onChange).not.toHaveBeenCalled()
  await act(async () => root.render(render([file])))
  expect(container.querySelector('img')?.alt).toContain('kept.png')
  expect(onChange).not.toHaveBeenCalled()
  expect(container.querySelector('[aria-label="添加图片"]')).toBeNull()
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="删除原参考"]')!.click(),
  )
  expect(onChange).toHaveBeenCalledWith([])
})
