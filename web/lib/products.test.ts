// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  productApi,
  productDraftKey,
  productFields,
  restoreProductDraft,
  productDraftSchema,
  productCreationDraftKey,
  restoreProductCreationDraft,
  type CommerceProduct,
} from './products'
import { assertRequestScope } from './request-scope'

const product: CommerceProduct = {
  ...productFields(),
  id: 'p-1',
  name: '香水',
  version: 2,
  productAssetIds: ['bottle'],
  adoptedAssetIds: {},
  createdAt: '',
  updatedAt: '',
}
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})
it('isolates unsaved records by account and project while preserving their original version', () => {
  localStorage.setItem(
    productDraftKey('alice', 'p-1'),
    JSON.stringify({ ...product, name: '本地草稿', version: 1 }),
  )
  expect(restoreProductDraft('alice', product)).toMatchObject({ name: '本地草稿', version: 1 })
  expect(restoreProductDraft('bob', product)).toMatchObject({ name: '香水', version: 2 })
  localStorage.setItem(
    productDraftKey('alice', undefined, 'project-a'),
    JSON.stringify({ ...productFields(), name: 'A项目草稿', projectId: 'project-a' }),
  )
  expect(restoreProductDraft('alice', undefined, 'project-a').name).toBe('A项目草稿')
  expect(restoreProductDraft('alice', undefined, 'project-b')).toMatchObject({
    name: '',
    projectId: 'project-b',
  })
})
it('rejects corrupted draft data and counts product and style references together', () => {
  localStorage.setItem(productDraftKey('alice', 'p-1'), '{')
  expect(restoreProductDraft('alice', product).name).toBe('香水')
  expect(
    productDraftSchema.safeParse({
      productAssetIds: ['1', '2', '3', '4'],
      referenceAssetIds: ['5', '6', '7'],
    }).success,
  ).toBe(false)
})
it('restores creation intent only within the same account and product', () => {
  localStorage.setItem(
    productCreationDraftKey('alice', 'p-1'),
    JSON.stringify({ purpose: 'scene', instructions: '靠窗自然光', count: 3 }),
  )
  expect(restoreProductCreationDraft('alice', 'p-1')).toMatchObject({
    purpose: 'scene',
    instructions: '靠窗自然光',
    count: 3,
  })
  expect(restoreProductCreationDraft('bob', 'p-1').instructions).toBe('')
  expect(restoreProductCreationDraft('alice', 'p-2').instructions).toBe('')
})
it('uses the customer session for product saves and adoption without crossing admin scope', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ product }))
  vi.stubGlobal('fetch', fetcher)
  localStorage.setItem('istudio-access-token', 'customer')
  localStorage.setItem('istudio-admin-token', 'operator')
  await productApi.save(productFields(product), 'p-1')
  await productApi.adopt('p-1', 'a-1')
  expect(new Headers(fetcher.mock.calls[0]![1].headers).get('Authorization')).toBe(
    'Bearer customer',
  )
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).version).toBe(2)
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ assetId: 'a-1' })
  expect(() => assertRequestScope('commerce/products', 'admin')).toThrow()
  expect(() => assertRequestScope('commerce/../admin/models', 'frontend')).toThrow()
})
