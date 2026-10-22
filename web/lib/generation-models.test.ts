import { expect, it } from 'vitest'
import {
  compatibleImageParameters,
  modelCompatibilityIssue,
  type PublicImageModel,
} from './generation-models'

const model: PublicImageModel = {
  id: 'limited',
  name: '受限模型',
  model: '受限模型',
  capabilities: { referenceImages: false, aspectRatios: ['3:4'], resolutions: ['1K'] },
}

it('identifies incompatible history and preset parameters without mutating them', () => {
  const parameters = { aspectRatio: '16:9', resolution: '4K', hasImages: true }
  const snapshot = { ...parameters }
  expect(modelCompatibilityIssue(model, parameters)).toContain('比例 16:9、清晰度 4K、参考图片')
  expect(compatibleImageParameters(model, parameters)).toEqual({
    aspectRatio: '3:4',
    resolution: '1K',
  })
  expect(parameters).toEqual(snapshot)
})

it('allows text-only use and requires image support for commerce even before upload', () => {
  const parameters = { aspectRatio: '3:4', resolution: '1K', hasImages: false }
  expect(modelCompatibilityIssue(model, parameters)).toBe('')
  expect(modelCompatibilityIssue(model, { ...parameters, requiresImages: true })).toContain(
    '此工具所需的图片输入',
  )
})

it('retains compatible choices and tolerates an older API during rolling upgrades', () => {
  const parameters = { aspectRatio: '3:4', resolution: '1K', hasImages: false }
  expect(compatibleImageParameters(model, parameters)).toEqual({
    aspectRatio: '3:4',
    resolution: '1K',
  })
  expect(modelCompatibilityIssue({ id: 'old', name: 'old', model: 'old' }, parameters)).toBe('')
})
