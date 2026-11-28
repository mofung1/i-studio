import { expect, it } from 'vitest'
import { creditHelpHref, creditReturnPath } from './credit-navigation'

it.each([
  ['product-main', 'product-main-trio'],
  ['detail-page', 'detail-page-trio'],
  ['clothing-set', 'clothing-model-duo'],
])('returns to the %s recipe draft without replaying its handoff', (task, recipe) => {
  const source = new URLSearchParams({
    mode: 'commerce',
    task,
    recipe,
    projectId: 'catalog-1',
    resumeTask: 'unrelated-record',
    review: '1',
    referenceAsset: 'old-asset',
    collectionHandoff: 'old-collection',
  })
  const help = new URL(creditHelpHref('/workbench', source), 'https://istudio.local')
  expect(help.pathname).toBe('/account')
  expect(help.hash).toBe('#credits')
  expect(creditReturnPath(help.searchParams.get('returnTo'))).toBe(
    `/studio?mode=commerce&task=${task}&projectId=catalog-1&recipe=${recipe}`,
  )
})

it('accepts only creation routes and drops mismatched recipe parameters', () => {
  expect(creditReturnPath('//other.example/studio?mode=commerce')).toBe('/studio')
  expect(creditReturnPath('/assets?mode=commerce')).toBe('/studio')
  expect(creditReturnPath('/studio?mode=commerce&task=detail-page&recipe=clothing-model-duo')).toBe(
    '/studio?mode=commerce&task=detail-page',
  )
  expect(creditHelpHref('/products', new URLSearchParams({ projectId: 'catalog-1' }))).toBe(
    '/account#credits',
  )
})
