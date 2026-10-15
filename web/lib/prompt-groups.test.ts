import { describe, expect, it } from 'vitest'
import { groupPromptTemplates, promptGroupKey } from './prompt-groups'
import type { PromptTemplate } from './ai-settings'
const template = (key: string, category: string): PromptTemplate => ({
  key,
  category,
  name: key,
  content: '内容',
  defaultContent: '内容',
  enabled: true,
  sortOrder: 0,
})
describe('prompt navigation groups', () => {
  it('separates large module and clothing categories by their actual purpose', () => {
    expect(promptGroupKey(template('module.product-main.white', 'module'))).toBe('main-modules')
    expect(promptGroupKey(template('module.detail-page.spec', 'module'))).toBe('detail-modules')
    expect(promptGroupKey(template('image.clothing.model', 'clothing'))).toBe('clothing-generation')
    expect(promptGroupKey(template('clothing.pose.1', 'clothing'))).toBe('clothing-planning')
    expect(promptGroupKey(template('clothing.style.studio', 'clothing'))).toBe('clothing-styles')
    expect(promptGroupKey(template('reverse.scene', 'reverse'))).toBe('reverse')
  })
  it('keeps unknown templates discoverable and searches descriptions across groups', () => {
    const items = [
      template('rewrite', 'system'),
      { ...template('module.clothing-set.clothing-front', 'clothing'), description: '领口特写' },
      template('future-template', 'future'),
    ]
    expect(groupPromptTemplates(items).flatMap((group) => group.templates)).toHaveLength(3)
    expect(
      groupPromptTemplates(items, '领口')
        .flatMap((group) => group.templates)
        .map((item) => item.key),
    ).toEqual(['module.clothing-set.clothing-front'])
    expect(groupPromptTemplates(items, '没有匹配')).toEqual([])
  })
})
