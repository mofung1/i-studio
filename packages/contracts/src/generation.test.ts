import { describe, expect, it } from 'vitest'

import {
  generalGenerationInputSchema,
  sellingPointInputSchema,
  whiteBackgroundInputSchema,
} from './generation.js'

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

  it('does not require language for white-background tasks', () => {
    const result = whiteBackgroundInputSchema.parse({
      mode: 'commerce',
      taskType: 'white-background',
      productAssetIds: ['asset-1'],
      productName: '保温杯',
      productCategory: '家居用品',
    })

    expect(result.taskType).toBe('white-background')
    expect('outputLanguage' in result).toBe(false)
  })

  it('requires at least one selling point for selling-point tasks', () => {
    const result = sellingPointInputSchema.safeParse({
      mode: 'commerce',
      taskType: 'selling-point',
      productAssetIds: ['asset-1'],
      productName: '降噪耳机',
      productCategory: '数码',
      sellingPoints: [],
    })

    expect(result.success).toBe(false)
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
