// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProductEditor } from './product-editor'
import { productFields, type CommerceProduct } from '@/lib/products'

vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}))
const original: CommerceProduct = {
  ...productFields(),
  id: 'product-1',
  name: '香水',
  description: '商家原始描述',
  sellingPoints: '已确认卖点',
  preserveDetails: '保留瓶盖',
  productAssetIds: ['original'],
  version: 2,
  adoptedAssetIds: {},
  createdAt: '',
  updatedAt: '',
}
let root: Root, container: HTMLDivElement
let writes: Record<string, unknown>[],
  saved: CommerceProduct,
  conflict: boolean,
  uploadCount: number
const button = (name: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === name,
  )!
const input = (name: string) =>
  Array.from(container.querySelectorAll('label'))
    .find((element) => element.textContent?.trim().startsWith(name))!
    .querySelector('input,textarea,select') as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
async function fill(name: string, value: string) {
  const field = input(name)
  await act(async () => {
    const prototype =
      field.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : field.tagName === 'SELECT'
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(
      new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    )
  })
}
function Harness({ isNew = false }: { isNew?: boolean }) {
  const [product, setProduct] = useState<CommerceProduct | undefined>(isNew ? undefined : original)
  return (
    <ProductEditor
      owner="customer"
      product={product}
      defaultProjectId="project-1"
      visionEnabled
      onSaved={setProduct}
      onDirty={() => {}}
      onBusy={() => {}}
    />
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem('istudio-access-token', 'customer')
  saved = original
  writes = []
  conflict = false
  uploadCount = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (path === '/v1/projects')
        return Response.json({ projects: [{ id: 'project-1', name: '新品项目' }] })
      if (path.endsWith('/analyze'))
        return Response.json({
          analysis: {
            description: 'AI建议描述',
            sellingPoints: '可核对的卖点',
            preserveDetails: '瓶身轮廓与标签',
          },
          model: 'vision',
          warnings: ['请确认商家规格'],
        })
      if (path === '/v1/assets' && init?.method === 'POST') {
        uploadCount++
        return Response.json({ asset: { id: `upload-${uploadCount}` } })
      }
      if (init?.method === 'PATCH' || init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        writes.push(body)
        if (conflict) {
          conflict = false
          saved = { ...saved, name: '其他窗口更新', version: 3 }
          return Response.json({ message: '商品档案已有更新，请重新确认' }, { status: 409 })
        }
        saved = { ...saved, ...body, version: (body.version ?? 0) + 1 }
        return Response.json({ product: saved })
      }
      return Response.json({ product: saved })
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('previews AI suggestions without changing the draft or saved product until the user applies and saves', async () => {
  await act(async () => root.render(<Harness />))
  await act(async () => button('编辑档案').click())
  await act(async () => button('识图整理资料').click())
  expect(input('商品描述').value).toBe('商家原始描述')
  expect(container.querySelector('[aria-label="商品资料建议"]')?.textContent).toContain(
    'AI建议描述',
  )
  expect(writes).toHaveLength(0)
  await act(async () => button('应用建议').click())
  expect(input('商品描述').value).toBe('AI建议描述')
  expect(writes).toHaveLength(0)
  await act(async () => button('保存档案').click())
  expect(writes[0]).toMatchObject({ name: '香水', description: 'AI建议描述', version: 2 })
})

it('preserves the local draft on a 409 and requires an explicit choice before saving onto the latest version', async () => {
  await act(async () => root.render(<Harness />))
  await act(async () => button('编辑档案').click())
  await fill('商品描述', '我的未保存修改')
  conflict = true
  await act(async () => button('保存档案').click())
  expect(input('商品描述').value).toBe('我的未保存修改')
  expect(button('保存档案').disabled).toBe(true)
  expect(container.textContent).toContain('本地草稿尚未覆盖它')
  await act(async () => button('继续使用当前草稿').click())
  await act(async () => button('保存档案').click())
  expect(writes[1]).toMatchObject({ version: 3, description: '我的未保存修改' })
})

it('inherits the entry project and refuses too many references before uploading any files', async () => {
  await act(async () => root.render(<Harness isNew />))
  expect(input('所属项目').value).toBe('project-1')
  const picker = container.querySelector<HTMLInputElement>('input[aria-label="上传商品原图"]')!
  const openPicker = vi.spyOn(picker, 'click')
  await act(async () => button('添加原图').click())
  expect(openPicker).toHaveBeenCalledOnce()
  Object.defineProperty(picker, 'files', {
    configurable: true,
    value: Array.from(
      { length: 7 },
      (_, index) => new File(['test'], `${index}.png`, { type: 'image/png' }),
    ),
  })
  await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })))
  expect(container.textContent).toContain('合计最多 6 张')
  expect(uploadCount).toBe(0)
  Object.defineProperty(picker, 'files', {
    configurable: true,
    value: [new File(['test'], 'original.png', { type: 'image/png' })],
  })
  await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })))
  await fill('商品名称', '新商品')
  await act(async () => button('保存档案').click())
  expect(writes[0]).toMatchObject({
    name: '新商品',
    projectId: 'project-1',
    productAssetIds: ['upload-1'],
  })
})
