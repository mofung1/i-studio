import { describe, expect, it } from 'vitest'
import {
  applicationFor,
  fillPromptVariables,
  promptVariables,
  resolvePresetEndpoint,
  validatePreset,
  type PersonalPrompt,
} from './personal-prompts'

describe('personal prompt application', () => {
  it('deduplicates variables and preserves literal replacement characters', () => {
    expect(promptVariables('拍摄 {{ 产品 }}，突出 {{产品}} 的 {{颜色}}')).toEqual(['产品', '颜色'])
    expect(fillPromptVariables('{{产品}} / {{产品}}', { 产品: '$& bottle' })).toBe(
      '$& bottle / $& bottle',
    )
  })
  it('requires all variable values before replacing a draft', () => {
    expect(() => fillPromptVariables('拍摄 {{产品}}', {})).toThrow('填写全部变量')
  })
  it('checks the destination tool description limit after filling variables', () => {
    const item = {
      title: 'Preset',
      kind: 'preset',
      prompt: '{{描述}}'.repeat(5),
      config: {
        mode: 'commerce',
        taskType: 'product-retouch',
        model: 'model',
        aspectRatio: '1:1',
        resolution: '2K',
        count: 1,
      },
    } as PersonalPrompt
    expect(() => applicationFor(item, { 描述: 'x'.repeat(300) })).toThrow('1000')
  })
  it('rejects invalid preset values', () => {
    expect(() =>
      validatePreset({
        mode: 'general',
        model: 'model',
        aspectRatio: '1:1',
        resolution: '2K',
        count: 5,
      }),
    ).toThrow('4 张')
  })
  it('does not silently change to a different model when an endpoint disappears', () => {
    const config = validatePreset({
      mode: 'general',
      model: 'requested',
      endpointId: 'old',
      aspectRatio: '1:1',
      resolution: '2K',
      count: 1,
    })
    expect(
      resolvePresetEndpoint(config, [
        { id: 'old', model: 'other' },
        { id: 'new', model: 'requested' },
      ]).id,
    ).toBe('new')
    expect(() => resolvePresetEndpoint(config, [{ id: 'old', model: 'other' }])).toThrow('暂不可用')
  })
})
