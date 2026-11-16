// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProductCreation } from './product-creation'
import { productFields, type CommerceProduct, type ProductVersion } from '@/lib/products'
import type { PublicImageModel } from '@/lib/generation-models'

vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: true, user: { id: 'customer-1' }, available: 5000 },
    loading: false,
  }),
}))
vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} />,
  useProtectedImageUrl: (path: string) => ({ source: path, state: 'loaded', retry: vi.fn() }),
  downloadProtectedAsset: vi.fn().mockResolvedValue(undefined),
}))

const product: CommerceProduct = {
  ...productFields(),
  id: 'product-1',
  name: '琥珀香水',
  productAssetIds: ['original-1'],
  referenceAssetIds: ['style-1'],
  version: 3,
  projectId: 'project-1',
  adoptedAssetIds: {},
  createdAt: '',
  updatedAt: '',
}
const model: PublicImageModel = {
  id: 'model-1',
  name: '商品模型',
  model: 'gpt-image-2',
  isDefault: true,
  capabilities: {
    referenceImages: true,
    maskEditing: true,
    aspectRatios: ['1:1', '3:4'],
    resolutions: ['1K'],
  },
}
let root: Root, container: HTMLDivElement
let versions: ProductVersion[],
  submissions: Record<string, unknown>[],
  adoption: string[],
  maskFiles: File[]
let saved = product
let dirty = false
const button = (label: string, parent: ParentNode = container) =>
  Array.from(parent.querySelectorAll<HTMLButtonElement>('button')).find(
    (element) =>
      element.textContent?.trim() === label || element.getAttribute('aria-label') === label,
  )!
const fill = async (label: string, value: string, parent: ParentNode = container) => {
  const wrapper = Array.from(parent.querySelectorAll('label')).find((element) =>
    element.textContent?.trim().startsWith(label),
  )!
  const input = wrapper.querySelector('input,textarea,select') as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
  await act(async () => {
    const prototype =
      input.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : input.tagName === 'SELECT'
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(
      new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    )
  })
}
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 190))
  })
function Harness({ maskEditing = true }: { maskEditing?: boolean }) {
  const [current, setCurrent] = useState(saved)
  return (
    <ProductCreation
      product={current}
      dirty={dirty}
      editorBusy={false}
      models={[{ ...model, capabilities: { ...model.capabilities!, maskEditing } }]}
      onProductUpdated={setCurrent}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('istudio-access-token', 'customer-session')
  versions = []
  submissions = []
  adoption = []
  maskFiles = []
  dirty = false
  saved = { ...product, adoptedAssetIds: {} }
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['mask'], { type: 'image/png' })),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/generation/quote'))
        return Response.json({
          modelId: 'model-1',
          unitPriceMinor: 100,
          totalMinor: 100,
          quantity: 1,
          canAfford: true,
          availableMinor: 5000,
          heldMinor: 0,
          creditName: '积分',
          creditScale: 100,
        })
      if (path.endsWith('/versions'))
        return Response.json({ versions, total: versions.length, nextCursor: '' })
      if (path.endsWith('/adopt')) {
        const { assetId } = JSON.parse(String(init?.body))
        adoption.push(assetId)
        saved = { ...saved, adoptedAssetIds: { main: assetId } }
        return Response.json({ product: saved })
      }
      if (path === '/v1/assets' && init?.method === 'POST') {
        maskFiles.push((init.body as FormData).get('file') as File)
        return Response.json({ asset: { id: 'mask-1' } })
      }
      if (path.endsWith('/generation/tasks') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        submissions.push(body)
        const number = submissions.length
        versions = [
          {
            assetId: `result-${number}`,
            contentPath: `/v1/assets/result-${number}/content`,
            thumbnailPath: `/v1/assets/result-${number}/thumbnail`,
            taskId: `task-${number}`,
            purpose: 'main',
            parentAssetId: body.parentAssetId ?? '',
            productVersion: 3,
            adopted: false,
            createdAt: '',
            width: 200,
            height: 100,
            sizeBytes: 100,
          },
          ...versions,
        ]
        return Response.json(
          { task: { id: `task-${number}`, input: body, status: 'queued' } },
          { status: 202 },
        )
      }
      if (/\/generation\/tasks\/task-/.test(path)) {
        const number = Number(path.split('-').at(-1))
        const body = submissions[number - 1]
        return Response.json({
          task: {
            id: `task-${number}`,
            input: body,
            status: 'succeeded',
            resultImages: [`/v1/assets/result-${number}/content`],
          },
        })
      }
      return Response.json({ tasks: [] })
    }),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('generates from the saved product, edits a selected version with an alpha mask, adopts it and can return to the old version', async () => {
  await act(async () => root.render(<Harness />))
  await settle()
  await fill('补充要求', '浅灰色背景，柔和侧光')
  expect(button('生成商品主图').disabled).toBe(false)
  await act(async () => button('生成商品主图').click())
  expect(submissions[0]).toMatchObject({
    productId: 'product-1',
    productVersion: 3,
    productPurpose: 'main',
    productInstructions: '浅灰色背景，柔和侧光',
    projectId: 'project-1',
  })
  expect(container.querySelectorAll('article')).toHaveLength(1)
  await act(async () => button('采用此图').click())
  expect(adoption).toEqual(['result-1'])
  await act(async () => button('局部修改').click())
  const dialog = document.querySelector('[role="dialog"]')!
  const image = dialog.querySelector('img')!
  Object.defineProperties(image, { naturalWidth: { value: 200 }, naturalHeight: { value: 100 } })
  await act(async () => image.dispatchEvent(new Event('load')))
  await act(async () => {
    dialog.querySelector('details')!.open = true
    button('添加矩形', dialog).click()
  })
  await fill('修改说明', '将选中区域改为浅灰色桌面', dialog)
  await settle()
  await act(async () => button('生成修改版本', dialog).click())
  expect(maskFiles).toHaveLength(1)
  expect(maskFiles[0]).toMatchObject({ name: 'product-edit-mask.png', type: 'image/png' })
  expect(submissions[1]).toMatchObject({
    productId: 'product-1',
    parentAssetId: 'result-1',
    maskAssetId: 'mask-1',
    count: 1,
    productPurpose: 'main',
    productInstructions: '将选中区域改为浅灰色桌面',
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(container.querySelectorAll('article')).toHaveLength(2)
  await act(async () => button('采用此图').click())
  expect(adoption).toEqual(['result-1', 'result-2'])
  await act(async () => button('采用此图').click())
  expect(adoption).toEqual(['result-1', 'result-2', 'result-1'])
  expect(submissions).toHaveLength(2)
})

it('keeps incomplete edits in the dialog after a failed submission and never submits on cancel', async () => {
  versions = [
    {
      assetId: 'result-1',
      contentPath: '/v1/assets/result-1/content',
      thumbnailPath: '',
      taskId: 'task-old',
      purpose: 'main',
      parentAssetId: '',
      productVersion: 3,
      adopted: false,
      createdAt: '',
      width: 200,
      height: 100,
      sizeBytes: 100,
    },
  ]
  const baseFetch = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation(async (...args) => {
    if (String(args[0]).endsWith('/generation/tasks') && args[1]?.method === 'POST')
      return Response.json({ message: '当前渠道暂不可用' }, { status: 400 })
    return baseFetch(...args)
  })
  await act(async () => root.render(<Harness />))
  await settle()
  await act(async () => button('局部修改').click())
  const dialog = document.querySelector('[role="dialog"]')!
  const image = dialog.querySelector('img')!
  Object.defineProperties(image, { naturalWidth: { value: 200 }, naturalHeight: { value: 100 } })
  await act(async () => image.dispatchEvent(new Event('load')))
  await act(async () => {
    dialog.querySelector('details')!.open = true
    button('添加矩形', dialog).click()
  })
  await fill('修改说明', '保留此说明', dialog)
  await settle()
  await act(async () => button('生成修改版本', dialog).click())
  expect(dialog.textContent).toContain('已添加 1 处选区')
  expect(dialog.querySelector('textarea')?.value).toBe('保留此说明')
  expect(dialog.textContent).toContain('当前渠道暂不可用')
  await act(async () => button('取消', dialog).click())
  expect(submissions).toHaveLength(0)
})

it('blocks generation with unsaved product edits and only opens mask editing for a verified model', async () => {
  dirty = true
  versions = [
    {
      assetId: 'result-1',
      contentPath: '/v1/assets/result-1/content',
      thumbnailPath: '',
      taskId: 'task-old',
      purpose: 'main',
      parentAssetId: '',
      productVersion: 3,
      adopted: false,
      createdAt: '',
      width: 200,
      height: 100,
      sizeBytes: 100,
    },
  ]
  await act(async () => root.render(<Harness maskEditing={false} />))
  await settle()
  expect(button('生成商品主图').disabled).toBe(true)
  expect(button('局部修改').disabled).toBe(true)
  expect(container.textContent).toContain('档案有未保存的修改')
  expect(submissions).toHaveLength(0)
})
