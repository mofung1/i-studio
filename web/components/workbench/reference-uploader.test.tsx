// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReferenceUploader } from './reference-uploader'
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
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('本地上传')
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
