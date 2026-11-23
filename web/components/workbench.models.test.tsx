// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StudioPage from '@/app/studio/page'
import {
  creationDraftKey,
  readCreationDraft,
  writeCreationDraft,
  type CreationDraftRecord,
} from '@/lib/creation-drafts'
import { Workbench } from './workbench'
import type { SubmitParams } from './workbench/use-generation-task'
import { generationInputSchema, type ClothingShot, type CommerceTaskType } from '@/lib/contracts'
import { clothingModelRecipe } from '@/lib/commerce-recipe'
import { historyWorkbenchUrl } from './workbench/use-workbench-handoff'

const generation = vi.hoisted(() => ({ submit: vi.fn() }))
const navigation = vi.hoisted(() => ({ query: '' }))

// Model behavior assumes local storage is available; draft failures have separate coverage.
vi.mock('@/lib/creation-drafts', async (original) => ({
  ...(await original<typeof import('@/lib/creation-drafts')>()),
  readCreationDraft: vi.fn(async () => null),
  writeCreationDraft: vi.fn(async () => {}),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/workbench',
  useSearchParams: () => new URLSearchParams(navigation.query),
}))
vi.mock('./studio-shell', () => ({
  StudioShell: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./workbench/studio-tool-launcher', () => ({ StudioToolLauncher: () => null }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: true,
      user: { id: 'member' },
      available: 5000,
      held: 0,
      creditName: '积分',
    },
    loading: false,
  }),
}))
vi.mock('./prompt-reverse-provider', () => ({ usePromptReverse: () => ({ openReverse: vi.fn() }) }))
vi.mock('./workbench/workbench-rail', () => ({ WorkbenchRail: () => null }))
vi.mock('./workbench/workbench-header', () => ({ WorkbenchHeader: () => null }))
vi.mock('./workbench/result-workspace', () => ({
  ResultWorkspace: ({ starter }: { starter?: ReactNode }) => <>{starter}</>,
}))
vi.mock('./workbench/creation-library-tools', () => ({ CreationLibraryTools: () => null }))
vi.mock('./workbench/use-reverse-prompt-handoff', () => ({ useReversePromptHandoff: () => {} }))
vi.mock('./workbench/use-personal-prompt-handoff', () => ({ usePersonalPromptHandoff: () => {} }))
vi.mock('./workbench/use-generation-task', () => ({
  useGenerationTask: () => ({
    generationTask: null,
    resultHistory: [],
    activeResultIndex: 0,
    activeResult: null,
    isSubmitting: false,
    isGenerating: false,
    notice: null,
    setNotice: vi.fn(),
    setActiveResultIndex: vi.fn(),
    submit: generation.submit,
    removeResult: vi.fn(),
  }),
}))

let container: HTMLDivElement
let root: Root
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = () => 'blob:product-preview'
      static revokeObjectURL = () => {}
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  localStorage.setItem('istudio-access-token', 'member-token')
  navigation.query = ''
  vi.mocked(readCreationDraft).mockReset()
  vi.mocked(writeCreationDraft).mockReset()
  fetcher.mockReset()
  generation.submit.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const modelTrigger = () => container.querySelector<HTMLButtonElement>('[aria-label="模型选择"]')!
async function waitForQuote() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150)
  })
}

it.each([
  ['general', 'product-main', 'prompt', 'AI 优化'],
  ['commerce', 'product-main', 'requirements', 'AI 帮写'],
  ['commerce', 'detail-page', 'requirements', 'AI 帮写'],
  ['commerce', 'viral-recreate', 'requirements', 'AI 帮写'],
  ['commerce', 'product-retouch', 'requirements', 'AI 帮写'],
] as const)(
  'optimizes %s/%s through the configured AI and can undo the result',
  async (mode, task, target, label) => {
    let submitted: FormData | null = null
    fetcher.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/capabilities'))
        return new Response(
          JSON.stringify({
            aiEnabled: true,
            promptEnhanceEnabled: true,
            promptVision: false,
            imageEndpoints: [{ id: 'a', name: '模型 A', model: 'A', isDefault: true }],
          }),
        )
      if (path.endsWith('/prompts/enhance')) {
        submitted = init?.body as FormData
        return new Response(
          JSON.stringify({
            text: '保留商品外形，完善构图与柔光，保持原有包装文字。',
            model: 'fixture-prompt',
          }),
        )
      }
      if (path.endsWith('/quote')) return quoteResponse()
      throw new Error(`Unexpected request: ${url}`)
    })
    await act(async () => root.render(<Workbench initialMode={mode} initialTask={task} />))
    const input = container.querySelector<HTMLTextAreaElement>('.prompt-input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        '保留商品外形，不新增文字',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === label,
    )!
    expect(button).toBeDefined()
    await act(async () => button.click())
    expect(submitted).not.toBeNull()
    expect(submitted!.get('target')).toBe(target)
    expect(submitted!.get('taskType')).toBe(mode === 'general' ? null : task)
    expect(submitted!.get('text')).toBe('保留商品外形，不新增文字')
    expect(input.value).toContain('完善构图与柔光')
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === '撤销')!
        .click(),
    )
    expect(input.value).toBe('保留商品外形，不新增文字')
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/generation/tasks'))).toBe(
      false,
    )
  },
)

function quoteResponse() {
  return new Response(
    JSON.stringify({
      modelId: 'a',
      unitPriceMinor: 100,
      totalMinor: 100,
      quantity: 1,
      availableMinor: 5000,
      heldMinor: 0,
      canAfford: true,
      creditName: '积分',
      creditScale: 100,
    }),
  )
}

async function openStudio(url: URL) {
  navigation.query = url.search
  const page = await StudioPage({
    searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
  })
  await act(async () => root.render(page))
}

function mockCommercePricing(getAvailable = () => 5000, getUnitPrice = () => 125) {
  fetcher.mockImplementation(async (url) => {
    const { pathname, searchParams } = new URL(String(url))
    if (pathname.endsWith('/capabilities'))
      return Response.json({
        aiEnabled: true,
        imageEndpoints: [{ id: 'a', name: '模型 A', model: 'A', isDefault: true }],
      })
    if (!pathname.endsWith('/quote')) throw new Error(`Unexpected request: ${url}`)
    const quantity = Number(searchParams.get('count'))
    const availableMinor = getAvailable()
    const unitPriceMinor = getUnitPrice()
    const totalMinor = unitPriceMinor * quantity
    return Response.json({
      modelId: searchParams.get('modelId'),
      unitPriceMinor,
      totalMinor,
      quantity,
      availableMinor,
      heldMinor: 0,
      canAfford: totalMinor <= availableMinor,
      creditName: '创作点',
      creditScale: 100,
    })
  })
}

async function dropProduct(name: string) {
  const product = new File(['product image'], name, { type: 'image/png' })
  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [product] } })
  await act(async () =>
    container.querySelector('.config-card-assets .reference-uploader')!.dispatchEvent(drop),
  )
  return product
}

async function commerceCaseUrl(task: CommerceTaskType) {
  await openStudio(
    new URL(`/studio?mode=commerce&task=${task}&projectId=my-project`, 'http://localhost'),
  )
  const cta = container.querySelector<HTMLAnchorElement>('.commerce-starter-actions a')
  expect(cta?.textContent).toBe('用我的商品做同款')
  return new URL(cta!.href)
}

function useInMemoryDrafts() {
  const drafts = new Map<string, CreationDraftRecord<unknown>>()
  vi.mocked(writeCreationDraft).mockImplementation(async (owner, context, value, source = '') => {
    drafts.set(creationDraftKey(owner, context), {
      version: 1,
      source,
      savedAt: Date.now(),
      value,
    })
  })
  vi.mocked(readCreationDraft).mockImplementation(async (owner, context, parse) => {
    const draft = drafts.get(creationDraftKey(owner, context))
    return draft ? { ...draft, value: parse(draft.value) } : null
  })
}

const commerceTrioCases = [
  {
    task: 'product-main',
    recipe: 'product-main-trio',
    title: '商品上架套图',
    aspectRatio: '1:1',
    moduleCounts: { white: 1, scene: 1, detail: 1 },
    labels: ['白底主图', '场景主图', '细节主图'],
  },
  {
    task: 'detail-page',
    recipe: 'detail-page-trio',
    title: '商品详情套图',
    aspectRatio: '3:4',
    moduleCounts: { hero: 1, material: 1, scene: 1 },
    labels: ['首屏主视觉', '材质纹理图', '场景应用图'],
  },
] as const

function casePreviewLabels() {
  return Array.from(
    container.querySelectorAll('.creation-starter-recipe figcaption'),
    (caption) => caption.textContent,
  )
}

it.each(commerceTrioCases)(
  'opens $title and submits the user’s product only after confirming the trio quote',
  async ({ task, recipe, title, aspectRatio, moduleCounts, labels }) => {
    let balance = 5000
    mockCommercePricing(() => balance)
    const target = await commerceCaseUrl(task)
    expect(target.pathname).toBe('/studio')
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      mode: 'commerce',
      task,
      recipe,
      projectId: 'my-project',
    })
    await openStudio(target)
    await waitForQuote()
    const submitButton = () => container.querySelector<HTMLButtonElement>('button.generate-button')!
    const selectionCount = () =>
      container.querySelector('.config-card-assets .field-heading span')?.textContent
    expect(container.querySelector('.generate-meta')?.textContent).toContain('预计产出 3 张')
    expect(container.querySelector('.generate-meta')?.textContent).toContain(aspectRatio)
    const summary = container.querySelector('[aria-label="同款套图配置"]')
    if (task === 'product-main') {
      expect(summary).toBeNull()
    } else {
      expect(summary?.textContent).toContain(title)
      for (const label of labels) expect(summary?.textContent).toContain(`${label} × 1`)
    }
    expect(container.querySelector('.config-card-assets .reference-dropzone')).not.toBeNull()
    expect(container.textContent).toContain('3.75 创作点')
    expect(selectionCount()).toBe('1–6 张')
    expect(submitButton().textContent).toContain('请先选择商品原图')
    expect(container.querySelector('.generate-bar [role="alert"]')).toBeNull()
    expect(casePreviewLabels()).toEqual(['商品原图', ...labels])
    expect(submitButton().disabled).toBe(true)
    balance = 200
    await act(async () => window.dispatchEvent(new Event('istudio-account-refresh')))
    const product = await dropProduct('my-product.png')
    expect(casePreviewLabels()).toEqual(['商品原图', ...labels])
    expect(selectionCount()).toBe('已选 1 张')
    expect(submitButton().disabled).toBe(true)
    await waitForQuote()
    expect(container.textContent).toContain('余额不足')
    const cost = container.querySelector('.generate-bar .creation-credit-estimate')!
    expect(cost.textContent).toContain('预计预留 3.75 创作点')
    expect(cost.textContent).not.toContain('单价')
    expect(cost.querySelector('[aria-label="查看费用明细"]')?.getAttribute('aria-expanded')).toBe(
      'false',
    )
    const creditHelp = cost.querySelector<HTMLAnchorElement>('a')!
    expect(creditHelp.target).toBe('')
    const backToDraft = new URL(creditHelp.href).searchParams.get('returnTo')
    expect(Object.fromEntries(new URL(backToDraft!, window.location.origin).searchParams)).toEqual({
      mode: 'commerce',
      task,
      projectId: 'my-project',
      recipe,
    })
    expect(submitButton().disabled).toBe(true)
    balance = 5000
    await act(async () => window.dispatchEvent(new Event('istudio-account-refresh')))
    await waitForQuote()
    expect(submitButton().textContent).toBe('确认生成 3 张')
    expect(submitButton().disabled).toBe(false)
    expect(generation.submit).not.toHaveBeenCalled()
    await act(async () => submitButton().click())
    expect(generation.submit).toHaveBeenCalledTimes(1)
    const submission = generation.submit.mock.calls[0]![0] as SubmitParams
    expect(submission.productFiles).toEqual([product])
    expect(submission.referenceFiles).toEqual([])
    expect(submission).toMatchObject({
      confirmedQuote: { modelId: 'a', quantity: 3, totalMinor: 375, creditName: '创作点' },
    })
    expect(submission.buildPayload(['my-product-asset'], [])).toMatchObject({
      projectId: 'my-project',
      mode: 'commerce',
      taskType: task,
      aspectRatio,
      productAssetIds: ['my-product-asset'],
      moduleMode: 'custom',
      moduleCounts,
      moduleOrder: Object.keys(moduleCounts),
      count: 3,
    })
    const removeProduct = container.querySelector<HTMLButtonElement>(
      'button[aria-label="删除主图"]',
    )!
    await act(async () => removeProduct.click())
    expect(selectionCount()).toBe('1–6 张')
    expect(submitButton().disabled).toBe(true)
    expect(container.querySelector('.generate-bar [role="alert"]')).toBeNull()
  },
)

it('uses only the selected garment for two modeled views after confirming their credit total', async () => {
  let available = 100
  let unitPrice = 125
  mockCommercePricing(
    () => available,
    () => unitPrice,
  )
  const target = await commerceCaseUrl('clothing-set')
  expect(Object.fromEntries(target.searchParams)).toMatchObject({
    mode: 'commerce',
    task: 'clothing-set',
    recipe: 'clothing-model-duo',
    projectId: 'my-project',
  })
  await openStudio(target)
  const confirm = () => container.querySelector<HTMLButtonElement>('button.generate-button')!
  await waitForQuote()
  expect(casePreviewLabels()).toEqual(['服装原图', '正面上身图', '侧面上身图'])
  expect(container.querySelector('.generate-meta')?.textContent).toContain('预计产出 2 张')
  expect(confirm().disabled).toBe(true)
  const garment = await dropProduct('my-shirt.png')
  expect(casePreviewLabels()).toEqual(['服装原图', '正面上身图', '侧面上身图'])
  expect(container.textContent).toContain('余额不足')
  expect(confirm().disabled).toBe(true)
  expect(container.textContent).toContain('2.5 创作点')
  available = 5000
  unitPrice = 200
  await act(async () => window.dispatchEvent(new Event('istudio-account-refresh')))
  expect(confirm().disabled).toBe(true)
  await waitForQuote()
  expect(confirm().disabled).toBe(false)
  expect(confirm().textContent).toBe('确认生成 2 张')
  expect(container.querySelector('.credit-estimate-summary')?.textContent).toContain(
    '预计预留 4 创作点',
  )
  expect(generation.submit).not.toHaveBeenCalled()
  await act(async () => confirm().click())
  expect(generation.submit).toHaveBeenCalledTimes(1)
  const submission = generation.submit.mock.calls[0]![0] as SubmitParams
  expect(submission.productFiles).toEqual([garment])
  expect(submission.referenceFiles).toEqual([])
  expect(submission.modelFile).toBeUndefined()
  expect(submission.confirmedQuote).toMatchObject({
    modelId: 'a',
    unitPriceMinor: 200,
    quantity: 2,
    totalMinor: 400,
    creditName: '创作点',
  })
  const payload = generationInputSchema.parse(submission.buildPayload(['owned-shirt'], []))
  expect(payload).toMatchObject({
    mode: 'commerce',
    taskType: 'clothing-set',
    projectId: 'my-project',
    productAssetIds: ['owned-shirt'],
    clothingMode: 'model',
    clothingModelSource: 'generated',
    aspectRatio: '3:4',
    count: 2,
    moduleCounts: { 'clothing-model': 2 },
    clothingPlan: [
      { moduleKey: 'clothing-model', label: '正面上身图' },
      { moduleKey: 'clothing-model', label: '侧面上身图' },
    ],
  })
  expect(payload).not.toHaveProperty('modelAssetId')
})

it('restores an outfit’s garment and edited shot from history and waits for a fresh confirmation', async () => {
  const shots: ClothingShot[] = clothingModelRecipe.shots.map((shot) => ({ ...shot }))
  shots[1]!.description = '测试中保存的侧面拍摄要求'
  const record = {
    id: 'history-outfit',
    status: 'succeeded',
    createdAt: '2026-11-01',
    input: {
      mode: 'commerce',
      taskType: 'clothing-set',
      projectId: 'saved-project',
      clothingMode: 'model' as const,
      clothingModelSource: 'generated' as const,
      clothingPlan: shots,
      productAssetIds: ['saved-shirt'],
      count: 2,
      endpointId: 'a',
    },
  }
  mockCommercePricing()
  const pricing = fetcher.getMockImplementation()!
  fetcher.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith('/tasks/history-outfit')) return Response.json({ task: record })
    if (path.endsWith('/assets/saved-shirt/metadata'))
      return Response.json({
        asset: {
          id: 'saved-shirt',
          filename: 'saved-shirt.png',
          mime: 'image/png',
          sizeBytes: 25,
          contentPath: '/v1/assets/saved-shirt/content',
          thumbnailPath: '/v1/assets/saved-shirt/thumbnail',
        },
      })
    if (path.endsWith('/assets/saved-shirt/thumbnail'))
      return new Response(new Blob(['image'], { type: 'image/png' }))
    return pricing(url, init)
  })
  const target = new URL(historyWorkbenchUrl(record, true), 'http://localhost')
  await openStudio(target)
  await waitForQuote()
  expect(generation.submit).not.toHaveBeenCalled()
  const confirm = container.querySelector<HTMLButtonElement>('button.generate-button')!
  expect(confirm.disabled).toBe(false)
  expect(confirm.textContent).toBe('确认生成 2 张')
  expect(container.querySelector('.credit-estimate-summary')?.textContent).toContain('预计预留 2.5')
  await act(async () => confirm.click())
  const submission = generation.submit.mock.calls[0]![0] as SubmitParams
  expect(submission.productFiles).toMatchObject([{ kind: 'asset', assetId: 'saved-shirt' }])
  expect(submission.confirmedQuote?.totalMinor).toBe(250)
  expect(submission.buildPayload(['saved-shirt'], [])).toMatchObject({
    projectId: 'saved-project',
    clothingPlan: shots,
    clothingModelSource: 'generated',
  })
})

it('isolates the ordinary clothing draft and each project’s modeled outfit draft', async () => {
  mockCommercePricing()
  useInMemoryDrafts()
  const ordinary = new URL(
    '/studio?mode=commerce&task=clothing-set&projectId=one',
    'http://localhost',
  )
  const recipe = new URL(ordinary)
  recipe.searchParams.set('recipe', 'clothing-model-duo')
  const anotherProject = new URL(recipe)
  anotherProject.searchParams.set('projectId', 'two')
  async function saveGarment(name: string) {
    await dropProduct(name)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
  }
  await openStudio(ordinary)
  const ordinaryMode = container.querySelector<HTMLButtonElement>(
    '.clothing-mode-selector button[aria-pressed="true"]',
  )!
  expect(ordinaryMode.textContent).toContain('商品组图')
  expect(casePreviewLabels()).toEqual([])
  await saveGarment('ordinary-shirt.png')
  await openStudio(recipe)
  expect(container.querySelector('.uploaded-thumb')).toBeNull()
  await saveGarment('recipe-shirt.png')
  await openStudio(anotherProject)
  expect(container.querySelector('.uploaded-thumb')).toBeNull()
  await openStudio(ordinary)
  expect(container.querySelector('img[alt*="ordinary-shirt.png"]')).not.toBeNull()
  await openStudio(recipe)
  expect(container.querySelector('img[alt*="recipe-shirt.png"]')).not.toBeNull()
  expect(generation.submit).not.toHaveBeenCalled()
})

it.each(commerceTrioCases)(
  'keeps ordinary $task and $title drafts independent',
  async ({ task, recipe }) => {
    mockCommercePricing()
    useInMemoryDrafts()
    const ordinary = new URL(`/studio?mode=commerce&task=${task}`, 'http://localhost')
    const trio = new URL(ordinary)
    trio.searchParams.set('recipe', recipe)
    const requirements = () => container.querySelector<HTMLTextAreaElement>('.prompt-input')!
    async function saveRequirements(text: string) {
      await act(async () => {
        const input = requirements()
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          input,
          text,
        )
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350)
      })
    }
    await openStudio(ordinary)
    expect(casePreviewLabels()).toEqual([])
    expect(container.querySelector('.recipe-settings-summary')).toBeNull()
    expect(container.textContent).not.toContain('更多设置')
    expect(container.querySelector('[aria-label="图片模块模式"]')).not.toBeNull()
    expect(container.querySelector('.generate-meta')?.textContent).toContain('预计产出 1 张')
    await dropProduct('ordinary-product.png')
    await saveRequirements('普通草稿有独立的拍摄要求')
    await openStudio(trio)
    expect(requirements().value).not.toBe('普通草稿有独立的拍摄要求')
    expect(container.querySelector('.uploaded-thumb')).toBeNull()
    expect(container.querySelector('.generate-meta')?.textContent).toContain('预计产出 3 张')
    await dropProduct('trio-product.png')
    const settings = requirements().closest('details')
    const modulePicker = container.querySelector('.module-picker')
    expect(modulePicker).not.toBeNull()
    if (task === 'product-main') {
      expect(settings).toBeNull()
      expect(modulePicker?.closest('details')).toBeNull()
    } else {
      expect(settings?.open).toBe(false)
      const summary = settings!.querySelector('summary')!
      expect(summary.textContent).toContain('调整套图设置')
      await act(async () => summary.click())
      expect(settings?.open).toBe(true)
    }
    await saveRequirements('同款套图保留瓶身图案')
    await openStudio(ordinary)
    expect(requirements().value).toBe('普通草稿有独立的拍摄要求')
    expect(container.querySelector('img[alt*="ordinary-product.png"]')).not.toBeNull()
    expect(container.querySelector('.generate-meta')?.textContent).toContain('预计产出 1 张')
    await openStudio(trio)
    expect(requirements().value).toBe('同款套图保留瓶身图案')
    expect(container.querySelector('img[alt*="trio-product.png"]')).not.toBeNull()
    expect(container.querySelector('.generate-meta')?.textContent).toContain('预计产出 3 张')
    expect(generation.submit).not.toHaveBeenCalled()
  },
)

it.each([
  ['general', 'product-main'],
  ['commerce', 'product-main'],
  ['commerce', 'detail-page'],
  ['commerce', 'viral-recreate'],
  ['commerce', 'product-retouch'],
  ['commerce', 'clothing-set'],
] as const)(
  'applies a %s/%s starter without generating or replacing the selected model',
  async (mode, task) => {
    fetcher.mockImplementation(async (url) => {
      if (String(url).endsWith('/capabilities'))
        return new Response(
          JSON.stringify({
            aiEnabled: true,
            creditName: '创作点',
            imageEndpoints: [
              {
                id: 'future',
                name: '以后更换的模型',
                model: 'future-name',
                isDefault: true,
                priceMinor: 125,
                usageHint: '可配置的使用建议',
              },
            ],
          }),
        )
      if (String(url).includes('/quote')) return quoteResponse()
      throw new Error(`Unexpected request: ${url}`)
    })
    await act(async () => root.render(<Workbench initialMode={mode} initialTask={task} />))
    const target = container.querySelector<HTMLTextAreaElement>(
      task === 'clothing-set' ? '#clothing-requirements' : '.prompt-input',
    )!
    expect(target.value).toBe('')
    if (mode === 'commerce') {
      const menuTrigger = container.querySelector<HTMLButtonElement>(
        '.commerce-description-trigger',
      )!
      expect(menuTrigger.getAttribute('aria-expanded')).toBe('false')
      await act(async () =>
        menuTrigger.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        ),
      )
      expect(menuTrigger.getAttribute('aria-expanded')).toBe('true')
      expect(container.querySelector('.commerce-description-menu')).toBeNull()
    }
    const example =
      mode === 'commerce'
        ? document.querySelector<HTMLElement>('.commerce-description-menu [role="menuitem"]')!
        : container.querySelector<HTMLButtonElement>('.creation-example-list button')!
    expect(example).not.toBeNull()
    await act(async () => example.click())
    expect(target.value.length).toBeGreaterThan(20)
    expect(container.querySelector('.creation-example-list')).toBeNull()
    expect(container.querySelector('.commerce-description-trigger')).toBeNull()
    expect(document.querySelector('.commerce-description-menu')).toBeNull()
    expect(container.textContent).toContain('以后更换的模型')
    expect(container.textContent).toContain('可配置的使用建议')
    expect(
      fetcher.mock.calls.every(
        ([url]) => String(url).includes('/capabilities') || String(url).includes('/quote'),
      ),
    ).toBe(true)
    expect(generation.submit).not.toHaveBeenCalled()
    const original = target.value
    await act(async () => example.click())
    expect(target.value).toBe(original)
  },
)

it('keeps an existing draft and parameters instead of offering an overwrite shortcut', async () => {
  fetcher.mockImplementation(async (url) =>
    String(url).endsWith('/capabilities')
      ? new Response(
          JSON.stringify({
            aiEnabled: true,
            imageEndpoints: [{ id: 'a', name: '模型 A', model: 'A' }],
          }),
        )
      : quoteResponse(),
  )
  await act(async () =>
    root.render(
      <Workbench
        initialMode="general"
        initialTask="product-main"
        initialPrompt="这是已经填写的创作需求"
        initialAspectRatio="3:4"
        initialResolution="1K"
        initialCount="2"
      />,
    ),
  )
  expect(container.querySelector<HTMLTextAreaElement>('.prompt-input')!.value).toBe(
    '这是已经填写的创作需求',
  )
  expect(container.querySelector('.creation-example-list')).toBeNull()
  expect(container.querySelector('[aria-label="图片参数配置"]')?.textContent).toContain(
    '3:4 · 1K · 2 张',
  )
})

it('reloads enabled models after an empty list and recalculates cost for the selected model', async () => {
  let enabled = false
  fetcher.mockImplementation(async (url) => {
    const parsed = new URL(String(url))
    if (parsed.pathname.endsWith('/capabilities'))
      return new Response(
        JSON.stringify({
          aiEnabled: enabled,
          imageEndpoints: enabled
            ? [
                { id: 'a', name: '模型 A', model: 'A', isDefault: true },
                { id: 'b', name: '模型 B', model: 'B' },
              ]
            : [],
        }),
      )
    if (parsed.pathname.endsWith('/quote')) {
      const id = parsed.searchParams.get('modelId')
      const price = id === 'a' ? 100 : 250
      return new Response(
        JSON.stringify({
          modelId: id,
          unitPriceMinor: price,
          totalMinor: price,
          canAfford: true,
          availableMinor: 5000,
          creditName: '积分',
        }),
      )
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  await act(async () => root.render(<Workbench initialMode="general" initialTask="product-main" />))
  expect(modelTrigger().disabled).toBe(true)
  expect(container.textContent).toContain('暂无可用模型')
  expect(container.textContent).not.toContain('正在计算费用')
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/quote'))).toHaveLength(0)
  enabled = true
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="重新加载模型列表"]')!.click(),
  )
  await waitForQuote()
  expect(modelTrigger().textContent).toContain('模型 A')
  expect(container.textContent).toContain('1 积分')
  await act(async () =>
    modelTrigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((element) => element.textContent === '模型 B')!
      .click(),
  )
  await waitForQuote()
  expect(modelTrigger().textContent).toContain('模型 B')
  expect(container.textContent).toContain('2.5 积分')
})

it('reports a failed model request instead of silently presenting an empty selector', async () => {
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ message: '模型服务暂不可用' }), { status: 503 }),
  )
  await act(async () => root.render(<Workbench initialMode="general" initialTask="product-main" />))
  expect(modelTrigger().disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('模型服务暂不可用')
  expect(container.textContent).not.toContain('正在计算费用')
})
