// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProductWorkspace } from './product-workspace'
import { productFields, type CommerceProduct } from '@/lib/products'

vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: true, user: { id: 'customer' }, available: 5000 },
    loading: false,
  }),
}))
vi.mock('@/components/account-access', () => ({
  AccountBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/studio-shell', () => ({
  StudioShell: ({ children, actions }: { children: ReactNode; actions: ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}))
vi.mock('@/components/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} width={640} height={480} />,
  useProtectedImageUrl: (path: string) => ({ source: path, state: 'loaded', retry: vi.fn() }),
  downloadProtectedAsset: vi.fn(),
}))

let root: Root, container: HTMLDivElement, products: CommerceProduct[]
const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  )!
async function createProduct(name: string) {
  const field = Array.from(container.querySelectorAll('label'))
    .find((element) => element.textContent?.trim().startsWith('商品名称'))!
    .querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, name)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => button('保存档案').click())
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('istudio-access-token', 'customer')
  products = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (path === '/v1/generation/capabilities')
        return Response.json({ imageEndpoints: [], promptVision: false })
      if (path === '/v1/projects') return Response.json({ projects: [] })
      if (path.endsWith('/versions'))
        return Response.json({ versions: [], total: 0, nextCursor: '' })
      if (path === '/v1/commerce/products' && init?.method === 'POST') {
        const product = {
          ...productFields(),
          ...JSON.parse(String(init.body)),
          id: `product-${products.length + 1}`,
          version: 1,
          productAssetIds: ['source'],
          adoptedAssetIds: {},
          createdAt: '',
          updatedAt: '',
        }
        products = [product, ...products]
        return Response.json({ product })
      }
      if (path === '/v1/commerce/products')
        return Response.json({ products, total: products.length, nextCursor: '' })
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

it('keeps a single product editor and creation panel after creating, saving and switching products', async () => {
  await act(async () => root.render(<ProductWorkspace />))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  await createProduct('第一件商品')
  expect(container.querySelectorAll('[aria-label="商品档案"]')).toHaveLength(1)
  expect(container.querySelectorAll('[aria-label="选择用途与生成"]')).toHaveLength(1)
  expect(
    Array.from(container.querySelectorAll('button')).filter(
      (element) => element.textContent?.trim() === '编辑档案',
    ),
  ).toHaveLength(1)
  await act(async () => button('建立商品档案').click())
  expect(container.querySelector('[aria-label="选择用途与生成"]')).toBeNull()
  await createProduct('第二件商品')
  expect(container.querySelectorAll('[aria-label="商品档案"]')).toHaveLength(1)
  expect(container.querySelectorAll('[aria-label="选择用途与生成"]')).toHaveLength(1)
  const first = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[aria-label="商品列表"] button'),
  ).find((element) => element.textContent?.includes('第一件商品'))!
  await act(async () => first.click())
  expect(container.querySelectorAll('[aria-label="商品档案"]')).toHaveLength(1)
  expect(container.querySelectorAll('[aria-label="选择用途与生成"]')).toHaveLength(1)
  expect(container.querySelector('[aria-label="商品档案"] h2')?.textContent).toBe('第一件商品')
})
