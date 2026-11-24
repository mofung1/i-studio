// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { GenerationQuote } from '@/lib/credits'
import type { SubmitParams } from './use-generation-task'
import { useGenerationFlow, type UseGenerationFlowOptions } from './use-generation-flow'

const SKIP_KEY = 'istudio-skip-regenerate-confirm'
let flow: ReturnType<typeof useGenerationFlow>
let root: Root
let container: HTMLDivElement

function quote(overrides: Partial<GenerationQuote> = {}): GenerationQuote {
  return {
    modelId: 'endpoint-a',
    unitPriceMinor: 100,
    totalMinor: 100,
    quantity: 1,
    availableMinor: 5000,
    heldMinor: 0,
    canAfford: true,
    creditName: '积分',
    creditScale: 100,
    ...overrides,
  }
}

const image = () => new File(['x'], 'product.png', { type: 'image/png' })
const notice = () => vi.fn<(value: { kind: 'success' | 'error'; message: string } | null) => void>()
const submit = () => vi.fn<(params: SubmitParams) => Promise<void>>().mockResolvedValue(undefined)

function defaults(overrides: Partial<UseGenerationFlowOptions> = {}): UseGenerationFlowOptions {
  return {
    mode: 'commerce',
    task: 'product-main',
    hasRecipe: false,
    expectedCount: 1,
    projectId: 'project-1',
    draftReady: true,
    templateBlockedReason: undefined,
    isSubmitting: false,
    isGenerating: false,
    hasProductImage: true,
    aiEnabled: true,
    compatibilityIssue: undefined,
    referenceFileCount: 0,
    moduleMode: 'smart',
    moduleTotal: 1,
    prompt: '商品主图',
    requirements: '保持包装文字',
    productFiles: [image()],
    referenceFiles: [],
    model: 'gpt-image-2',
    endpointId: 'endpoint-a',
    aspectRatio: '1:1',
    resolution: '2K',
    count: 1,
    style: 'unspecified',
    referenceStrength: 'medium',
    platform: 'smart',
    outputLanguage: 'none',
    moduleCounts: {},
    recreateStrength: 'style',
    enhancements: [],
    submit: submit(),
    onLogin: vi.fn(),
    setNotice: notice(),
    setHistoryTask: vi.fn(),
    setHistoryOpen: vi.fn(),
    setConfigCollapsed: vi.fn(),
    setPanelOpen: vi.fn(),
    ...overrides,
  }
}

function Harness(props: UseGenerationFlowOptions) {
  flow = useGenerationFlow(props)
  return null
}

async function render(options: UseGenerationFlowOptions) {
  await act(async () => root.render(<Harness {...options} />))
  return options
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-access-token', 'test-token')
  localStorage.removeItem(SKIP_KEY)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('blocks commerce generation until a product image is uploaded', async () => {
  const options = await render(defaults({ hasProductImage: false }))
  await act(async () => flow.createGenerationTask())
  expect(options.submit).not.toHaveBeenCalled()
  expect(options.setNotice).toHaveBeenCalledWith({ kind: 'error', message: '请先上传商品原图' })
})

it('blocks viral recreation unless exactly one reference image is selected', async () => {
  const options = await render(defaults({ task: 'viral-recreate', referenceFileCount: 0 }))
  await act(async () => flow.createGenerationTask())
  expect(options.submit).not.toHaveBeenCalled()
  expect(options.setNotice).toHaveBeenCalledWith({
    kind: 'error',
    message: '爆款复刻需要上传 1 张参考爆款图',
  })
})

it('blocks generation while a draft template is still blocked', async () => {
  const options = await render(
    defaults({ templateBlockedReason: '此模板需要参考图，请先上传自己的素材' }),
  )
  await act(async () => flow.createGenerationTask())
  expect(options.submit).not.toHaveBeenCalled()
  expect(options.setNotice).toHaveBeenCalledWith({
    kind: 'error',
    message: '此模板需要参考图，请先上传自己的素材',
  })
})

it('blocks generation when the total upload exceeds 20 MB', async () => {
  const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.png', { type: 'image/png' })
  const options = await render(defaults({ productFiles: [big] }))
  await act(async () => flow.createGenerationTask())
  expect(options.submit).not.toHaveBeenCalled()
  expect(options.setNotice).toHaveBeenCalledWith({
    kind: 'error',
    message: '本次上传图片总大小不能超过 20 MB',
  })
})

it('submits with the current files and leaves history view', async () => {
  const options = await render(defaults())
  await act(async () => flow.createGenerationTask())
  expect(options.submit).toHaveBeenCalledOnce()
  const params = vi.mocked(options.submit).mock.calls[0]![0]
  expect(params.productFiles).toEqual(options.productFiles)
  expect(params.referenceFiles).toEqual(options.referenceFiles)
  expect(options.setHistoryTask).toHaveBeenCalledWith(null)
  expect(options.setHistoryOpen).toHaveBeenCalledWith(false)
  expect(flow.submittedCount).toBe(1)
})

it('builds a commerce payload with recipe module order and project scope', async () => {
  const options = await render(
    defaults({
      hasRecipe: true,
      expectedCount: 2,
      moduleMode: 'custom',
      moduleCounts: { hero: 1, scene: 1 },
      moduleTotal: 2,
    }),
  )
  const confirmed = quote({ modelId: 'endpoint-a', quantity: 2, totalMinor: 200 })
  await act(async () => flow.createGenerationTask(confirmed))
  expect(options.submit).toHaveBeenCalledOnce()
  const payload = vi
    .mocked(options.submit)
    .mock.calls[0]![0].buildPayload(['asset-product'], ['asset-reference'])
  expect(payload).toMatchObject({
    mode: 'commerce',
    taskType: 'product-main',
    projectId: 'project-1',
    productAssetIds: ['asset-product'],
    moduleMode: 'custom',
    moduleCounts: { hero: 1, scene: 1 },
    moduleOrder: ['hero', 'scene'],
    count: 2,
  })
})

it('opens the confirmation dialog before regenerating when the skip flag is off', async () => {
  const options = await render(defaults())
  await act(async () => flow.requestRegenerate())
  expect(flow.confirmOpen).toBe(true)
  expect(options.submit).not.toHaveBeenCalled()

  await act(async () => flow.confirmGeneration())
  expect(flow.confirmOpen).toBe(false)
  expect(options.submit).toHaveBeenCalledOnce()
})

it('regenerates immediately when the user chose to skip the confirmation', async () => {
  localStorage.setItem(SKIP_KEY, '1')
  const options = await render(defaults())
  await act(async () => flow.requestRegenerate())
  expect(flow.confirmOpen).toBe(false)
  expect(options.submit).toHaveBeenCalledOnce()
})

it('auto-regenerates after history config has committed to state', async () => {
  const options = await render(defaults())
  await act(async () => flow.requestAutoRegenerate())
  expect(options.submit).toHaveBeenCalledOnce()
})
