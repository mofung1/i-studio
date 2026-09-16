import { describe, expect, it } from 'vitest'

import {
  generalGenerationInputSchema,
  productMainInputSchema,
} from './generation'

describe('generation input contracts', () => {
  it('defaults general generation to one image', () => {
    const result = generalGenerationInputSchema.parse({
      mode: 'general',
      prompt: '极简商品摄影',
      referenceAssetIds: [],
    })

    expect(result.count).toBe(1)
    expect(result.aspectRatio).toBe('1:1')
  })

  it('defaults product-main to no text without product metadata', () => {
    const result = productMainInputSchema.parse({
      mode: 'commerce',
      taskType: 'product-main',
      productAssetIds: ['asset-1'],
    })

    expect(result.taskType).toBe('product-main')
    expect(result.outputLanguage).toBe('none')
    expect('productName' in result).toBe(false)
  })

  it('accepts six references and sixteen images, but rejects larger requests', () => {
    const input = { mode: 'general', prompt: '商品摄影', referenceAssetIds: Array(6).fill('asset-1'), count: 16 }
    expect(generalGenerationInputSchema.safeParse(input).success).toBe(true)
    expect(generalGenerationInputSchema.safeParse({ ...input, count: 17 }).success).toBe(false)
    expect(generalGenerationInputSchema.safeParse({ ...input, referenceAssetIds: [...input.referenceAssetIds, 'asset-7'] }).success).toBe(false)
  })

  it('keeps an optional project association', () => {
    const result = generalGenerationInputSchema.parse({
      mode: 'general',
      prompt: '极简商品摄影',
      projectId: 'project-1',
    })

    expect(result.projectId).toBe('project-1')
  })
})
