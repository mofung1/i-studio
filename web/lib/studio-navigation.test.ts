import { expect, it } from 'vitest'
import { legacyStudioQuery } from './studio-navigation'

it('keeps the homepage public for normal visits and campaign parameters', () => {
  expect(legacyStudioQuery({})).toBeNull()
  expect(legacyStudioQuery({ utm_source: 'newsletter' })).toBeNull()
})
it('preserves historical creation state and repeated query values', () => {
  const target = legacyStudioQuery({
    mode: 'commerce',
    task: 'clothing-set',
    resumeTask: 'old-task',
    tag: ['a', 'b'],
    prompt: '白色 衬衫',
  })!
  const url = new URL(target, 'http://localhost')
  expect(url.pathname).toBe('/studio')
  expect(url.searchParams.get('task')).toBe('clothing-set')
  expect(url.searchParams.get('resumeTask')).toBe('old-task')
  expect(url.searchParams.get('prompt')).toBe('白色 衬衫')
  expect(url.searchParams.getAll('tag')).toEqual(['a', 'b'])
})
