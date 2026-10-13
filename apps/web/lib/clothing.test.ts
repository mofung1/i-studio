import { describe, expect, it } from 'vitest'
import { makeClothingPlan } from './clothing'
import { generationInputSchema } from './contracts'

const product = () => ({ mode: 'commerce', taskType: 'clothing-set', productAssetIds: ['garment'], clothingMode: 'product', count: 3, moduleCounts: { 'clothing-front': 1, 'clothing-3d': 1, 'clothing-detail': 1 }, clothingPlan: makeClothingPlan('product', { 'clothing-front': 1, 'clothing-3d': 1, 'clothing-detail': 1 }, '').shots })
describe('clothing planning contracts', () => {
  it('keeps canonical order independent of selection order', () => {
    const plan = makeClothingPlan('product', { 'clothing-detail': 1, 'clothing-front': 2 }, '真实资料'.repeat(500))
    expect(plan.shots.map(shot => shot.moduleKey)).toEqual(['clothing-front', 'clothing-front', 'clothing-detail'])
    expect(new Set(plan.shots.map(shot => shot.id)).size).toBe(3)
    expect(plan.shots.every(shot => shot.description.length < 2000)).toBe(true)
  })
  it('accepts product plans and rejects count, module and identity mismatches', () => {
    expect(generationInputSchema.safeParse(product()).success).toBe(true)
    expect(generationInputSchema.safeParse({ ...product(), count: 2 }).success).toBe(false)
    expect(generationInputSchema.safeParse({ ...product(), sceneAssetId: 'scene' }).success).toBe(false)
    const duplicated = product(); duplicated.clothingPlan[1]!.id = duplicated.clothingPlan[0]!.id
    expect(generationInputSchema.safeParse(duplicated).success).toBe(false)
    expect(generationInputSchema.safeParse({ ...product(), moduleCounts: { hero: 3 } }).success).toBe(false)
  })
  it('requires an uploaded model and limits model pictures to four', () => {
    const input = { ...product(), clothingMode: 'model', count: 4, moduleCounts: { 'clothing-model': 4 }, clothingPlan: makeClothingPlan('model', { 'clothing-model': 4 }, '').shots }
    expect(generationInputSchema.safeParse(input).success).toBe(false)
    expect(generationInputSchema.safeParse({ ...input, modelAssetId: 'model', sceneAssetId: 'scene' }).success).toBe(true)
    expect(generationInputSchema.safeParse({ ...input, modelAssetId: 'model', count: 5, moduleCounts: { 'clothing-model': 5 } }).success).toBe(false)
  })
  it('flags unseen backs and gives model shots different poses', () => {
    expect(makeClothingPlan('product', { 'clothing-back': 1 }, '').warnings.length).toBeGreaterThan(0)
    expect(new Set(makeClothingPlan('model', { 'clothing-model': 4 }, '').shots.map(shot => shot.description)).size).toBe(4)
  })
  it('uses configured module directions, poses and footer without changing shot identities', () => {
    const defaults = { modules: { 'clothing-front': '蓝色背景正面图', 'clothing-model': '展示胸前印花' }, poses: ['模特向右转身'], footer: '保留黑色领口' }
    const productPlan = makeClothingPlan('product', { 'clothing-front': 1 }, '', defaults)
    expect(productPlan.shots[0]?.description).toBe('蓝色背景正面图。保留黑色领口')
    const modelPlan = makeClothingPlan('model', { 'clothing-model': 1 }, '', defaults)
    expect(modelPlan.shots[0]?.description).toBe('展示胸前印花。模特向右转身。保留黑色领口')
    expect(modelPlan.shots[0]?.id).toBe('clothing-model-1')
    expect(makeClothingPlan('product', { 'clothing-front': 1 }, '', { ...defaults, footer: '' }).shots[0]?.description).toBe('蓝色背景正面图')
    expect(makeClothingPlan('product', { 'clothing-front': 1 }, '', { ...defaults, footer: '内容'.repeat(3000) }).shots[0]?.description.length).toBeLessThanOrEqual(2000)
  })
})
