import { expect, it } from 'vitest'
import { legacyStudioQuery, preserveStudioProject, studioToolUrl } from './studio-navigation'

it.each(['product-main', 'detail-page', 'viral-recreate', 'product-retouch', 'clothing-set'])(
  'keeps project ownership when switching to %s without replaying handoffs',
  (task) => {
    const source = new URLSearchParams({
      projectId: 'project 商品&01',
      mode: 'general',
      prompt: 'previous prompt',
      resumeTask: 'previous-task',
      referenceAsset: 'previous-image',
      collectionId: 'previous-preset',
      collectionHandoff: 'previous-handoff',
      reversePrompt: '1',
      inspirationId: 'previous-template',
    })
    const url = new URL(studioToolUrl('commerce', task, source), 'http://localhost')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: 'commerce',
      task,
      projectId: 'project 商品&01',
    })
  },
)

it('keeps the project when returning to general creation and drops the commerce task', () => {
  const source = new URLSearchParams('mode=commerce&task=clothing-set&projectId=project-a')
  expect(studioToolUrl('general', 'clothing-set', source)).toBe(
    '/studio?mode=general&projectId=project-a',
  )
})

it('preserves a new target handoff and explicit project instead of the source project', () => {
  const source = new URLSearchParams('projectId=old&resumeTask=old-task')
  expect(preserveStudioProject('/studio?resumeTask=new-task&projectId=new#details', source)).toBe(
    '/studio?resumeTask=new-task&projectId=new#details',
  )
  expect(preserveStudioProject('/studio?referenceAsset=image-2#details', source)).toBe(
    '/studio?referenceAsset=image-2&projectId=old#details',
  )
})

it('does not add empty ownership or inherit it into an external link', () => {
  expect(studioToolUrl('general')).toBe('/studio?mode=general')
  expect(studioToolUrl('general', undefined, new URLSearchParams('projectId=%20'))).toBe(
    '/studio?mode=general',
  )
  expect(
    preserveStudioProject('https://example.com/studio', new URLSearchParams('projectId=private')),
  ).toBe('https://example.com/studio')
})

it('keeps the homepage public for normal visits and campaign parameters', () => {
  expect(legacyStudioQuery({})).toBeNull()
  expect(legacyStudioQuery({ utm_source: 'newsletter' })).toBeNull()
})
it('routes legacy template links to the workbench while keeping their project', () => {
  const target = legacyStudioQuery({ inspirationId: 'template 中文', projectId: 'project-a' })!
  const url = new URL(target, 'http://localhost')
  expect(url.pathname).toBe('/studio')
  expect(url.searchParams.get('inspirationId')).toBe('template 中文')
  expect(url.searchParams.get('projectId')).toBe('project-a')
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
