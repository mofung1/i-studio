import { expect, it } from 'vitest'
import { historyWorkbenchUrl, referenceWorkbenchUrl } from './use-workbench-handoff'
import type { HistoryTask } from './use-task-history'

const record: HistoryTask = {
  id: 'history-task',
  status: 'succeeded',
  createdAt: '2026-11-16T00:00:00Z',
  input: { mode: 'commerce', taskType: 'clothing-set', projectId: 'original-project' },
}

it('restores a historical task in its original project when crossing workbenches', () => {
  const source = new URLSearchParams('projectId=current-project&referenceAsset=old-image')
  const url = new URL(historyWorkbenchUrl(record, true, source), 'http://localhost')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    mode: 'commerce',
    resumeTask: 'history-task',
    task: 'clothing-set',
    projectId: 'original-project',
    review: '1',
  })
})

it('keeps the current project when an older history record has no project', () => {
  const source = new URLSearchParams('projectId=current-project')
  const url = new URL(
    historyWorkbenchUrl({ ...record, input: { mode: 'general' } }, false, source),
    'http://localhost',
  )
  expect(Object.fromEntries(url.searchParams)).toEqual({
    mode: 'general',
    resumeTask: 'history-task',
    projectId: 'current-project',
  })
})

it.each([
  ['general', 'product-main'],
  ['commerce', 'clothing-set'],
  ['commerce', 'detail-page'],
] as const)('keeps project ownership when a result continues in %s / %s', (mode, task) => {
  const source = new URLSearchParams('projectId=project-a&resumeTask=old-task&prompt=old-prompt')
  const target = referenceWorkbenchUrl('/v1/assets/result-image/content', mode, task, source)!
  const url = new URL(target, 'http://localhost')
  expect(url.searchParams.get('projectId')).toBe('project-a')
  expect(url.searchParams.get('referenceAsset')).toBe('result-image')
  expect(url.searchParams.get('mode')).toBe(mode)
  expect(url.searchParams.get('task')).toBe(mode === 'commerce' ? task : null)
  expect(url.searchParams.has('resumeTask')).toBe(false)
  expect(url.searchParams.has('prompt')).toBe(false)
})

it('does not create a reference handoff for unprotected or malformed paths', () => {
  expect(
    referenceWorkbenchUrl('https://example.com/image.png', 'general', 'product-main'),
  ).toBeNull()
  expect(referenceWorkbenchUrl('/v1/assets//content', 'commerce', 'clothing-set')).toBeNull()
})
