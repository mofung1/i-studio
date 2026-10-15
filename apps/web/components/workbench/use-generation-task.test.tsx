// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useGenerationTask } from './use-generation-task'
let hook: ReturnType<typeof useGenerationTask>
let root: Root
function Harness() { const value = useGenerationTask('general:submission-test'); useEffect(() => { hook = value }); return null }
const payload = { mode: 'general', prompt: '一只猫', model: 'public-model', endpointId: 'public-model', count: 1, aspectRatio: '1:1', resolution: '2K', style: 'unspecified', referenceStrength: 'medium', referenceAssetIds: [] }
const submit = () => hook.submit({ productFiles: [], referenceFiles: [], buildPayload: () => payload, onAuthRequired: vi.fn() })
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear(); localStorage.setItem('istudio-access-token', 'fixture-account-token'); root = createRoot(document.createElement('div')) })
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals() })
it('reconciles a lost creation response with the same request, even when the reserved balance is now insufficient', async () => {
  const creations: RequestInit[] = []
  let quotes = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/generation/quote')) { quotes++; return new Response(JSON.stringify({ modelId: 'public-model', unitPriceMinor: 125, totalMinor: 125, canAfford: quotes === 1, availableMinor: quotes === 1 ? 125 : 0, creditName: '点数' })) }
    if (url.endsWith('/generation/tasks') && init?.method === 'POST') { creations.push(init); if (creations.length === 1) throw new TypeError('网络中断'); return new Response(JSON.stringify({ task: { id: 'existing-task', status: 'queued' } }), { status: 202 }) }
    return new Response(JSON.stringify(url.includes('/generation/tasks/existing-task') ? { task: { id: 'existing-task', status: 'queued' } } : { tasks: [] }))
  }))
  await act(async () => root.render(<Harness />))
  await act(async () => submit())
  // The hook automatically reconciles before a second user action is possible.
  expect(hook.generationTask?.id).toBe('existing-task')
  expect(creations).toHaveLength(2)
  expect(creations[0]?.body).toBe(creations[1]?.body)
  expect((creations[0]?.headers as Record<string, string>)['Idempotency-Key']).toBe((creations[1]?.headers as Record<string, string>)['Idempotency-Key'])
  expect(quotes).toBe(1)
})
it('blocks a new generation before uploading or submitting when balance is insufficient', async () => {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/quote') ? { canAfford: false, unitPriceMinor: 125, creditName: '创作币' } : { tasks: [] })))
  vi.stubGlobal('fetch', fetch)
  await act(async () => root.render(<Harness />))
  await act(async () => submit())
  expect(hook.notice?.message).toContain('创作币不足')
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/generation/tasks'))).toBe(false)
})
