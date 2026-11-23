// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useGenerationTask } from './use-generation-task'
const session = vi.hoisted(() => ({ owner: 'fixture-account' }))
vi.mock('@/components/account-provider', () => ({
  useAccount: () => ({ account: { user: session.owner ? { id: session.owner } : undefined } }),
}))
let hook: ReturnType<typeof useGenerationTask>
let root: Root
function Harness({
  scope = 'general:submission-test',
  restoreLatest = true,
}: {
  scope?: string
  restoreLatest?: boolean
}) {
  const value = useGenerationTask(scope, { restoreLatest })
  useEffect(() => {
    hook = value
  })
  return null
}
const payload = {
  mode: 'general',
  prompt: '一只猫',
  model: 'public-model',
  endpointId: 'public-model',
  count: 1,
  aspectRatio: '1:1',
  resolution: '2K',
  style: 'unspecified',
  referenceStrength: 'medium',
  referenceAssetIds: [],
}
const submit = () =>
  hook.submit({
    productFiles: [],
    referenceFiles: [],
    buildPayload: () => payload,
    onAuthRequired: vi.fn(),
  })
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  session.owner = 'fixture-account'
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('istudio-access-token', 'fixture-account-token')
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
it('reconciles a lost creation response with the same request, even when the reserved balance is now insufficient', async () => {
  const creations: RequestInit[] = []
  let quotes = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/generation/quote')) {
        quotes++
        return new Response(
          JSON.stringify({
            modelId: 'public-model',
            unitPriceMinor: 125,
            totalMinor: 125,
            canAfford: quotes === 1,
            availableMinor: quotes === 1 ? 125 : 0,
            creditName: '点数',
          }),
        )
      }
      if (url.endsWith('/generation/tasks') && init?.method === 'POST') {
        creations.push(init)
        if (creations.length === 1) throw new TypeError('网络中断')
        return new Response(JSON.stringify({ task: { id: 'existing-task', status: 'queued' } }), {
          status: 202,
        })
      }
      return new Response(
        JSON.stringify(
          url.includes('/generation/tasks/existing-task')
            ? { task: { id: 'existing-task', status: 'queued' } }
            : { tasks: [] },
        ),
      )
    }),
  )
  await act(async () => root.render(<Harness />))
  await act(async () => submit())
  // The hook automatically reconciles before a second user action is possible.
  expect(hook.generationTask?.id).toBe('existing-task')
  expect(creations).toHaveLength(2)
  expect(creations[0]?.body).toBe(creations[1]?.body)
  expect((creations[0]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
    (creations[1]?.headers as Record<string, string>)['Idempotency-Key'],
  )
  expect(quotes).toBe(1)
})
it('blocks a new generation before uploading or submitting when balance is insufficient', async () => {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes('/quote')
            ? { canAfford: false, unitPriceMinor: 125, creditName: '创作币' }
            : { tasks: [] },
        ),
      ),
  )
  vi.stubGlobal('fetch', fetch)
  await act(async () => root.render(<Harness />))
  await act(async () => submit())
  expect(hook.notice?.message).toContain('创作币不足')
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/generation/tasks'))).toBe(false)
})

it('requires a new confirmation when the trio total changes before any product upload', async () => {
  const confirmedQuote = {
    modelId: 'public-model',
    unitPriceMinor: 125,
    totalMinor: 375,
    quantity: 3,
    availableMinor: 5000,
    heldMinor: 0,
    canAfford: true,
    creditName: '创作点',
    creditScale: 100,
  }
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') throw new Error('Unexpected upload or generation')
    return Response.json(
      url.includes('/quote') ? { ...confirmedQuote, totalMinor: 400 } : { tasks: [] },
    )
  })
  vi.stubGlobal('fetch', fetcher)
  await act(async () => root.render(<Harness scope="commerce:product-main:product-main-trio" />))
  await act(async () =>
    hook.submit({
      productFiles: [new File(['product'], 'product.png', { type: 'image/png' })],
      referenceFiles: [],
      confirmedQuote,
      buildPayload: (productAssetIds) => ({
        mode: 'commerce',
        taskType: 'product-main',
        endpointId: 'public-model',
        productAssetIds,
        count: 3,
        moduleMode: 'custom',
        moduleCounts: { white: 1, scene: 1, detail: 1 },
      }),
      onAuthRequired: vi.fn(),
    }),
  )
  expect(hook.notice?.message).toContain('请确认最新费用')
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

it('locks a redo to one quoted image and recovers a lost response with the same request', async () => {
  const confirmedQuote = {
    modelId: 'public-model',
    unitPriceMinor: 125,
    totalMinor: 125,
    quantity: 1,
    availableMinor: 125,
    heldMinor: 0,
    canAfford: true,
    creditName: '创作点',
    creditScale: 100,
  }
  let quotes = 0
  const requests: Array<{ url: string; init: RequestInit }> = []
  const resultTask = {
    id: 'redone',
    status: 'succeeded',
    input: { mode: 'commerce', taskType: 'detail-page', redoSourceTaskId: 'original' },
    resultImages: ['/v1/assets/redone-asset/content'],
  }
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/quote')) {
      expect(new URL(url).searchParams.get('count')).toBe('1')
      quotes++
      return Response.json(
        quotes === 1 ? { ...confirmedQuote, unitPriceMinor: 130, totalMinor: 130 } : confirmedQuote,
      )
    }
    if (init?.method === 'POST') {
      requests.push({ url, init })
      if (requests.length === 1) throw new TypeError('creation response lost')
      return Response.json({ task: resultTask }, { status: 202 })
    }
    return Response.json({ tasks: [] })
  })
  vi.stubGlobal('fetch', fetcher)
  await act(async () => root.render(<Harness scope="commerce:product-main" />))
  const input = { assetId: 'original-photo', requirements: '更柔和的光线' }
  await act(async () =>
    expect(hook.submitImageRedo('original', input, confirmedQuote)).rejects.toThrow('费用已变更'),
  )
  expect(requests).toEqual([])

  await act(async () => hook.submitImageRedo('original', input, confirmedQuote))
  expect(requests).toHaveLength(2)
  expect(requests[0]?.url).toMatch(/\/generation\/tasks\/original\/redo-image$/)
  expect(requests[0]?.init.body).toBe(JSON.stringify(input))
  expect(new Headers(requests[0]?.init.headers).get('X-Expected-Unit-Price')).toBe('125')
  expect(requests[0]?.init.headers).toEqual(requests[1]?.init.headers)
  expect(requests[0]?.init.body).toBe(requests[1]?.init.body)
  expect(quotes).toBe(2)
  expect(hook.activeResult?.id).toBe('redone')
})

it('keeps completed results when a lost submission response is recovered after delivery', async () => {
  let submissions = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/quote'))
        return new Response(JSON.stringify({ unitPriceMinor: 125, canAfford: true }))
      if (init?.method === 'POST') {
        submissions++
        if (submissions === 1) throw new TypeError('creation response lost')
        return new Response(
          JSON.stringify({
            task: {
              id: 'already-finished',
              status: 'succeeded',
              input: payload,
              resultImages: ['/v1/assets/delivered/content'],
            },
          }),
          { status: 202 },
        )
      }
      return new Response(JSON.stringify({ tasks: [] }))
    }),
  )
  await act(async () => root.render(<Harness />))
  await act(async () => submit())
  expect(submissions).toBe(2)
  expect(hook.isGenerating).toBe(false)
  expect(hook.activeResult?.resultImages).toEqual(['/v1/assets/delivered/content'])
})
it('clears visible generated images when the account signs out', async () => {
  sessionStorage.setItem('istudio-pending-generation:general', 'completed-task')
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            task: {
              id: 'completed-task',
              status: 'succeeded',
              input: { mode: 'general' },
              resultImages: ['/private-image'],
            },
          }),
        ),
    ),
  )
  await act(async () => root.render(<Harness />))
  expect(hook.resultHistory).toHaveLength(1)
  await act(async () => {
    session.owner = ''
    localStorage.clear()
    root.render(<Harness />)
  })
  expect(hook.resultHistory).toHaveLength(0)
  expect(hook.activeResult).toBeNull()
  expect(hook.generationTask).toBeNull()
})

it('restores only the selected product task even if the server list contains other products', async () => {
  const tasks = [
    { id: 'other', status: 'queued', input: { mode: 'general', productId: 'product-b' } },
    { id: 'mine', status: 'queued', input: { mode: 'general', productId: 'product-a' } },
  ]
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.includes('/tasks/mine') ? { task: tasks[1] } : { tasks }),
  )
  vi.stubGlobal('fetch', fetcher)
  await act(async () => root.render(<Harness scope="product:product-a" />))
  expect(hook.generationTask?.id).toBe('mine')
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get('productId') === 'product-a'),
  ).toBe(true)
})

it('never restores a product generation into the ordinary image workbench', async () => {
  const tasks = [
    { id: 'product', status: 'queued', input: { mode: 'general', productId: 'product-a' } },
    { id: 'ordinary', status: 'queued', input: { mode: 'general' } },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.includes('/tasks/ordinary') ? { task: tasks[1] } : { tasks }),
    ),
  )
  await act(async () => root.render(<Harness />))
  expect(hook.generationTask?.id).toBe('ordinary')
})

it.each([false, true])(
  'restores an ordinary clothing task independently of case tasks (stale saved ID: %s)',
  async (staleSavedId) => {
    const scope = 'commerce:clothing-set'
    const key = `istudio-pending-generation:${scope}`
    const input = { mode: 'commerce', taskType: 'clothing-set' }
    const tasks = [
      { id: 'outfit', status: 'queued', input: { ...input, clothingModelSource: 'generated' } },
      { id: 'ordinary', status: 'queued', input },
    ]
    if (staleSavedId) sessionStorage.setItem(key, 'outfit')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const task = tasks.find((item) => url.endsWith(`/tasks/${item.id}`))
        return Response.json(task ? { task } : { tasks })
      }),
    )
    await act(async () => root.render(<Harness scope={scope} />))
    expect(hook.generationTask?.id).toBe('ordinary')
    expect(sessionStorage.getItem(key)).toBe('ordinary')
  },
)

it.each(['my-project', 'another-project'])(
  'resumes a saved outfit only in its own project (%s)',
  async (projectId) => {
    const scope = 'commerce:clothing-set:clothing-model-duo:my-project'
    const key = `istudio-pending-generation:${scope}`
    const task = {
      id: 'outfit',
      status: 'queued',
      input: {
        mode: 'commerce',
        taskType: 'clothing-set',
        clothingModelSource: 'generated',
        projectId,
      },
    }
    sessionStorage.setItem(key, task.id)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ task })),
    )
    await act(async () => root.render(<Harness scope={scope} restoreLatest={false} />))
    const belongsToProject = projectId === 'my-project'
    expect(hook.generationTask?.id).toBe(belongsToProject ? 'outfit' : undefined)
    expect(sessionStorage.getItem(key)).toBe(belongsToProject ? 'outfit' : null)
  },
)
