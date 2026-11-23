// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clothingModelRecipe } from '@/lib/commerce-recipe'
import { generationInputSchema } from '@/lib/contracts'
import { ResultWorkspace } from './result-workspace'

const reference = vi.hoisted(() => vi.fn())
const download = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const compare = vi.hoisted(() => vi.fn())
const protectedImage = vi.hoisted(() => vi.fn())
vi.mock('@/components/authenticated-image', () => ({
  useProtectedImageUrl: protectedImage,
  AuthenticatedImage: ({ path, alt }: { path: string; alt: string }) => (
    <img src={path} alt={alt} />
  ),
  downloadProtectedAsset: download,
}))
vi.mock('@/components/image-comparison-button', () => ({
  ImageComparisonButton: (options: {
    initialLeft?: string
    initialRight?: string
    originalFallbackPaths?: string[]
    disabled?: boolean
  }) => {
    compare(options)
    return <button disabled={options.disabled}>图片对比</button>
  },
}))
vi.mock('./history-drawer', () => ({ HistoryDrawer: () => null }))
let root: Root
let container: HTMLDivElement
const noop = () => {}
const result = {
  id: 'current',
  status: 'succeeded',
  resultImages: ['data:first', 'data:second', 'data:third'],
}
const history = {
  ...result,
  id: 'history',
  createdAt: '2026-10-18',
  input: { mode: 'commerce', taskType: 'detail-page', aspectRatio: '9:16' },
}
const props: ComponentProps<typeof ResultWorkspace> = {
  mode: 'general',
  task: 'product-main',
  aspectRatio: '1:1',
  resolution: '2K',
  expectedCount: 3,
  generatingCount: null,
  resultHistory: [result],
  activeResultIndex: 0,
  activeResult: result,
  generationTask: result,
  isGenerating: false,
  isSubmitting: false,
  historyOpen: false,
  historyTask: null,
  loadingHistoryConfigId: null,
  isRegeneratingHistory: false,
  onToggleHistory: noop,
  onSelectHistory: noop,
  onExitHistoryView: noop,
  onLoadHistoryConfig: noop,
  onRegenerateFromHistory: noop,
  onDeleteHistoryTask: async () => {},
  onUseImageAsReference: reference,
  onSetActiveResultIndex: noop,
  onRegenerate: noop,
}
async function loadResultImage(
  image = container.querySelector<HTMLImageElement>('.result-hero-image.is-preloading') ??
    container.querySelector<HTMLImageElement>('.result-hero-image')!,
) {
  Object.defineProperties(image, {
    currentSrc: { configurable: true, value: image.src },
    naturalWidth: { configurable: true, value: 1024 },
    naturalHeight: { configurable: true, value: 1024 },
  })
  await act(async () => image.dispatchEvent(new Event('load')))
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  download.mockClear()
  reference.mockClear()
  compare.mockClear()
  protectedImage.mockReset()
  protectedImage.mockImplementation((path: string) => ({
    source: path,
    resolvedPath: path || null,
    state: 'loaded',
    retry: vi.fn(),
  }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it.each(['general', 'commerce'] as const)(
  'uses the same navigation and tools for new and historic %s results',
  async (mode) => {
    for (const historyTask of [null, history]) {
      await act(async () =>
        root.render(<ResultWorkspace {...props} mode={mode} historyTask={historyTask} />),
      )
      const area = container.querySelector('.result-image-area')!
      const prev = area.querySelector<HTMLButtonElement>('[aria-label="上一张"]')!
      const next = area.querySelector<HTMLButtonElement>('[aria-label="下一张"]')!
      expect(prev.disabled).toBe(true)
      expect(area.querySelector('.result-image-viewport')).not.toBeNull()
      expect(container.querySelectorAll('.result-strip li')).toHaveLength(3)
      expect(container.querySelector('.canvas-image-footer')).toBeNull()
      await act(async () => next.click())
      await loadResultImage()
      expect(container.querySelector('.result-image-info')?.textContent).toContain('2 / 3')
      const toolbar = container.querySelector('.result-image-toolbar')!
      const button = (text: string) =>
        [...toolbar.querySelectorAll('button')].find((button) => button.textContent === text)!
      await act(async () => button('下载图片').click())
      expect(download).toHaveBeenLastCalledWith(
        'data:second',
        expect.stringContaining(historyTask ? 'history-2' : 'current-2'),
      )
      await act(async () => button('继续创作').click())
      expect(reference).toHaveBeenLastCalledWith('data:second', {
        mode: historyTask ? 'commerce' : mode,
        taskType: historyTask ? 'detail-page' : 'product-main',
      })
      await act(async () => button('全屏查看').click())
      const viewer = document.querySelector('.image-lightbox.is-fullscreen')!
      expect(viewer).not.toBeNull()
      expect(viewer.querySelector('.lightbox-stage [aria-label="下一张"]')).not.toBeNull()
      expect(viewer.querySelector('.lightbox-bar [aria-label="下载原图"]')).not.toBeNull()
      await act(async () => viewer.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click())
    }
  },
)

it('locks single-image actions until the selected image is displayed', async () => {
  const first = '/v1/assets/first/content'
  const second = '/v1/assets/second/content'
  const retry = vi.fn()
  const redo = vi.fn<NonNullable<ComponentProps<typeof ResultWorkspace>['onRedoImage']>>()
  let secondImageState = 'loading'
  const loadedImage = protectedImage.getMockImplementation()!
  protectedImage.mockImplementation((path: string) => {
    if (path === second && secondImageState !== 'loaded') {
      return { source: first, resolvedPath: first, state: secondImageState, retry }
    }
    return loadedImage(path)
  })
  const task = {
    ...result,
    input: generationInputSchema.parse({
      mode: 'commerce',
      taskType: 'product-main',
      endpointId: 'test-model',
      productAssetIds: ['product-original'],
    }),
    resultImages: [first, second],
    resultModules: ['white', 'scene'],
  }
  const render = () =>
    act(async () =>
      root.render(
        <ResultWorkspace {...props} mode="commerce" activeResult={task} onRedoImage={redo} />,
      ),
    )
  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('.result-image-commands button')].find(
      (candidate) => candidate.textContent === label,
    )!
  const imageActions = ['下载图片', '只重做这张', '全屏查看', '继续创作', '图片对比']
  const displayedImage = () =>
    container.querySelector<HTMLImageElement>('.result-hero-image:not(.is-preloading)')
  const expectImageActionsLocked = () => {
    for (const label of imageActions) expect(button(label).disabled, label).toBe(true)
    expect(button('下载整套').disabled).toBe(false)
  }

  await render()
  await loadResultImage()
  const previousImage = displayedImage()!
  expect(previousImage.getAttribute('src')).toBe(first)
  expect(button('只重做这张').disabled).toBe(false)

  await act(async () =>
    container.querySelector<HTMLButtonElement>('.result-image-area [aria-label="下一张"]')!.click(),
  )
  expect(displayedImage()?.getAttribute('src')).toBe(first)
  expect(displayedImage()?.alt).toBe('AI 生成结果 1')
  expect(container.textContent).toContain('正在切换图片…')
  expectImageActionsLocked()

  secondImageState = 'failed'
  await render()
  expectImageActionsLocked()
  expect(displayedImage()).toBeNull()
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="重新加载结果图"]')!.click(),
  )
  expect(retry).toHaveBeenCalledOnce()

  secondImageState = 'loaded'
  await render()
  expect(
    container
      .querySelector<HTMLImageElement>('.result-hero-image.is-preloading')
      ?.getAttribute('src'),
  ).toBe(second)
  expectImageActionsLocked()
  await loadResultImage(previousImage)
  expectImageActionsLocked()
  await loadResultImage()
  expect(displayedImage()?.getAttribute('src')).toBe(second)
  for (const label of imageActions) expect(button(label).disabled, label).toBe(false)
  await act(async () => button('下载图片').click())
  expect(download).toHaveBeenLastCalledWith(second, 'istudio-current-2.png')
  await act(async () => button('继续创作').click())
  expect(reference).toHaveBeenLastCalledWith(second, { mode: 'commerce', taskType: 'product-main' })
  expect(compare.mock.lastCall?.[0]).toMatchObject({
    initialLeft: '/v1/assets/product-original/content',
    initialRight: second,
  })
})

it('pairs the original product with the selected result and uses the displayed history inputs', async () => {
  const currentTask = {
    ...result,
    input: generationInputSchema.parse({
      mode: 'commerce',
      taskType: 'product-main',
      productAssetIds: ['invalid/path', 'current-product', 'later-product'],
      referenceAssetIds: ['other-reference'],
    }),
    resultImages: ['/v1/assets/first/content', '/v1/assets/second/content'],
  }
  await act(async () =>
    root.render(<ResultWorkspace {...props} mode="commerce" activeResult={currentTask} />),
  )
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.result-image-area [aria-label="下一张"]')!.click(),
  )
  expect(compare.mock.lastCall?.[0]).toMatchObject({
    initialLeft: '/v1/assets/current-product/content',
    initialRight: '/v1/assets/second/content',
    originalFallbackPaths: ['/v1/assets/later-product/content'],
  })

  const outfit = {
    ...history,
    input: {
      mode: 'commerce',
      taskType: 'clothing-set',
      productAssetIds: ['history-garment', 'history-garment-alternate'],
      modelAssetId: 'history-model',
      sceneAssetId: 'history-scene',
    },
    resultImages: ['/v1/assets/historic-outfit/content'],
  }
  await act(async () =>
    root.render(
      <ResultWorkspace
        {...props}
        mode="commerce"
        activeResult={currentTask}
        historyTask={outfit}
      />,
    ),
  )
  expect(compare.mock.lastCall?.[0]).toMatchObject({
    initialLeft: '/v1/assets/history-garment/content',
    initialRight: '/v1/assets/historic-outfit/content',
    originalFallbackPaths: ['/v1/assets/history-garment-alternate/content'],
    candidates: expect.arrayContaining([
      expect.objectContaining({
        path: '/v1/assets/history-garment/content',
        label: '服装原图 1',
      }),
    ]),
  })
})

it('keeps the result first when the task has no usable original', async () => {
  const outfit = {
    ...history,
    input: {
      mode: 'commerce',
      taskType: 'clothing-set',
      modelAssetId: 'history-model',
      sceneAssetId: 'history-scene',
    },
    resultImages: ['/v1/assets/historic-outfit/content'],
  }
  await act(async () => root.render(<ResultWorkspace {...props} historyTask={outfit} />))
  expect(compare.mock.lastCall?.[0].initialLeft).toBe('/v1/assets/historic-outfit/content')
  expect(compare.mock.lastCall?.[0].initialRight).toBeUndefined()
})

it('labels completed outfit views by the planned angle and keeps partial history unambiguous', async () => {
  const outfit = {
    ...history,
    input: {
      mode: 'commerce',
      taskType: 'clothing-set',
      clothingModelSource: 'generated' as const,
      clothingPlan: clothingModelRecipe.shots.map((shot) => ({ ...shot })),
      count: 2,
    },
    resultImages: ['data:front', 'data:side'],
    resultModules: ['clothing-model', 'clothing-model'],
  }
  await act(async () => root.render(<ResultWorkspace {...props} historyTask={outfit} />))
  await loadResultImage()
  const label = () => container.querySelector('.module-badge')?.textContent
  expect(label()).toBe('正面上身图')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.result-image-area [aria-label="下一张"]')!.click(),
  )
  await loadResultImage()
  expect(label()).toBe('侧面上身图')
  const partial = { ...outfit, resultImages: ['data:side'], resultModules: ['clothing-model'] }
  await act(async () => root.render(<ResultWorkspace {...props} historyTask={partial} />))
  await loadResultImage()
  expect(label()).toBe('模特上身')
})

it('shows only saved images from the running task and keeps them downloadable before completion', async () => {
  await act(async () =>
    root.render(
      <ResultWorkspace
        {...props}
        isGenerating
        generationTask={{ id: 'running', status: 'processing', resultImages: ['data:saved-first'] }}
      />,
    ),
  )
  expect(container.textContent).toContain('已保存 1 / 3 张')
  expect(container.querySelector<HTMLImageElement>('.result-hero-image')?.src).toBe(
    'data:saved-first',
  )
  expect(container.querySelector('.result-generating')).toBeNull()
  await loadResultImage()
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '下载图片',
  )!
  await act(async () => button.click())
  expect(download).toHaveBeenCalledWith('data:saved-first', 'istudio-running-1.png')
  await act(async () =>
    root.render(
      <ResultWorkspace
        {...props}
        isGenerating
        generationTask={{ id: 'next-running', status: 'processing', resultImages: [] }}
      />,
    ),
  )
  expect(container.querySelector('.result-hero-image')).toBeNull()
  expect(container.querySelector('.result-generating')).not.toBeNull()
})

it('separates a failed single-image redo from the previous successful suite', async () => {
  const source = {
    ...result,
    input: generationInputSchema.parse({
      mode: 'commerce',
      taskType: 'product-main',
      count: 3,
      productAssetIds: ['original-product'],
    }),
  }
  const failedRedo = {
    id: 'failed-redo',
    status: 'failed',
    input: {
      ...source.input,
      count: 1,
      redoSourceTaskId: source.id,
      redoSourceAssetId: 'source-image',
    },
    resultImages: [],
    errorMessage: 'AI 服务暂时无法重做这张图',
  }
  await act(async () =>
    root.render(
      <ResultWorkspace
        {...props}
        mode="commerce"
        resultHistory={[source]}
        activeResult={source}
        generationTask={failedRedo}
      />,
    ),
  )
  expect(container.textContent).toContain('单张重做失败')
  expect(container.textContent).toContain(failedRedo.errorMessage)
  expect(container.textContent).toContain('查看原版')
  expect(container.textContent).not.toContain('生成完成')
  expect(container.querySelector('.result-hero-image')).toBeNull()

  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="展开最近生成"]')!.click(),
  )
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="查看第 1 个版本的第 2 张"]')!
      .click(),
  )
  await loadResultImage()
  expect(container.textContent).toContain('生成完成')
  expect(container.textContent).not.toContain(failedRedo.errorMessage)
  expect(container.textContent).not.toContain('查看原版')
  expect(container.querySelector('.result-hero-image')?.getAttribute('src')).toBe(
    source.resultImages[1],
  )
})

it('shows the selected failed redo history even while a different task is generating', async () => {
  const redoHistory = {
    ...history,
    status: 'failed',
    resultImages: [],
    input: {
      ...history.input,
      redoSourceTaskId: 'source-task',
      redoSourceAssetId: 'source-image',
    },
    errorMessage: '历史重做任务的失败原因',
  }
  await act(async () =>
    root.render(
      <ResultWorkspace
        {...props}
        isGenerating
        generationTask={{ id: 'unrelated-running-task', status: 'processing' }}
        historyTask={redoHistory}
      />,
    ),
  )
  expect(container.textContent).toContain('单张重做失败')
  expect(container.textContent).toContain(redoHistory.errorMessage)
  expect(container.textContent).toContain('查看原版')
  expect(container.querySelector('.result-generating')).toBeNull()
})

it('keeps the redo selected when the original is unavailable and opens the exact image when found', async () => {
  const sourcePath = '/v1/assets/source-image/content'
  const redoImagePath = '/v1/assets/redo-image/content'
  const origin = {
    ...history,
    id: 'source-task',
    resultImages: [history.resultImages[0], sourcePath],
  }
  const redo = {
    ...history,
    id: 'redo-task',
    input: { ...history.input, redoSourceTaskId: origin.id, redoSourceAssetId: 'source-image' },
    resultImages: [redoImagePath],
  }
  const selectHistory = vi.fn()
  const fetchOrigin = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ task: { ...origin, resultImages: [history.resultImages[0]] } }),
    )
    .mockResolvedValueOnce(Response.json({ message: '生成任务不存在' }, { status: 404 }))
    .mockResolvedValueOnce(Response.json({ task: origin }))
  vi.stubGlobal('fetch', fetchOrigin)
  const tokenKey = 'istudio-access-token'
  const previousToken = localStorage.getItem(tokenKey)
  localStorage.setItem(tokenKey, 'original-lookup-token')

  try {
    const render = (historyTask: typeof history) =>
      act(async () =>
        root.render(
          <ResultWorkspace {...props} historyTask={historyTask} onSelectHistory={selectHistory} />,
        ),
      )
    await render(redo)
    await loadResultImage()
    const originalButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '查看原版',
    )!

    for (let attempt = 0; attempt < 2; attempt++) {
      await act(async () => originalButton.click())
      expect(container.querySelector('[role="alert"]')?.textContent).toBe('原版图片已删除或不可用')
      expect(container.querySelector('.result-hero-image')?.getAttribute('src')).toBe(redoImagePath)
      expect(selectHistory).not.toHaveBeenCalled()
    }
    await act(async () => originalButton.click())
    expect(selectHistory).toHaveBeenCalledExactlyOnceWith(origin)
    expect(fetchOrigin.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(
      Array(3).fill('/v1/generation/tasks/source-task'),
    )

    await render(origin)
    await loadResultImage()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('.result-hero-image')?.getAttribute('src')).toBe(sourcePath)
    expect(container.querySelector('.result-image-info')?.textContent).toContain('2 / 2')
  } finally {
    if (previousToken === null) localStorage.removeItem(tokenKey)
    else localStorage.setItem(tokenKey, previousToken)
  }
})

it('downloads the displayed task group from the workbench and distinguishes partial archives', async () => {
  const downloadButton = (text: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === text,
    )
  const fetchArchive = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: '部分图片文件已不可用' }), { status: 404 }),
    )
  vi.stubGlobal('fetch', fetchArchive)

  await act(async () =>
    root.render(<ResultWorkspace {...props} mode="commerce" historyTask={history} />),
  )
  await act(async () => downloadButton('下载整套')!.click())
  expect(fetchArchive.mock.calls[0]?.[0]).toMatch(/\/v1\/generation\/tasks\/history\/download$/)
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('部分图片文件已不可用')

  await act(async () =>
    root.render(
      <ResultWorkspace
        {...props}
        mode="commerce"
        isGenerating
        generationTask={{ id: 'new-running', status: 'processing', resultImages: ['data:saved'] }}
      />,
    ),
  )
  expect(container.querySelector('[role="alert"]')).toBeNull()
  await act(async () => downloadButton('下载已完成图片')!.click())
  expect(fetchArchive.mock.calls[1]?.[0]).toMatch(/\/v1\/generation\/tasks\/new-running\/download$/)

  const singleImage = { ...result, resultImages: ['data:single'] }
  await act(async () =>
    root.render(<ResultWorkspace {...props} mode="commerce" activeResult={singleImage} />),
  )
  expect(downloadButton('下载整套')).toBeUndefined()
  expect(downloadButton('下载已完成图片')).toBeUndefined()

  const redoHistory = {
    ...history,
    resultImages: ['data:redo'],
    input: {
      ...history.input,
      count: 1,
      redoSourceTaskId: 'original',
      redoSourceAssetId: 'original-image',
    },
  }
  await act(async () =>
    root.render(<ResultWorkspace {...props} mode="commerce" isRecipe historyTask={redoHistory} />),
  )
  expect(downloadButton('下载图片')).toBeDefined()
  expect(downloadButton('查看原版')).toBeDefined()
  expect(downloadButton('下载整套')).toBeUndefined()
})

it('reports the ZIP image count from the server even when the displayed task looks complete', async () => {
  const archives: string[] = []
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    archives.push(this.download)
  })
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:archive')
      static revokeObjectURL = vi.fn()
    },
  )
  const fetchArchive = vi.fn<typeof fetch>()
  fetchArchive.mockResolvedValueOnce(
    new Response('partial archive', {
      headers: { 'X-Archive-Image-Count': '2', 'X-Archive-Expected-Count': '3' },
    }),
  )
  fetchArchive.mockResolvedValueOnce(new Response('archive with no confirmed count'))
  fetchArchive.mockResolvedValueOnce(
    new Response('full archive', {
      headers: { 'X-Archive-Image-Count': '3', 'X-Archive-Expected-Count': '3' },
    }),
  )
  vi.stubGlobal('fetch', fetchArchive)
  vi.useFakeTimers()

  try {
    await act(async () =>
      root.render(<ResultWorkspace {...props} mode="commerce" historyTask={history} />),
    )
    const downloadGroup = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '下载整套',
    )!
    const notice = container.querySelector('.result-archive-notice')

    await act(async () => downloadGroup.click())
    expect(archives).toEqual(['商品详情套图-缺1张.zip'])
    expect(notice?.textContent).toBe('ZIP 已打包 2 / 3 张，缺少 1 张。')

    await act(async () => downloadGroup.click())
    expect(archives).toHaveLength(1)
    expect(notice?.getAttribute('role')).toBe('alert')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      '无法确认 ZIP 的图片数量，请重试',
    )

    await act(async () => downloadGroup.click())
    expect(archives).toEqual(['商品详情套图-缺1张.zip', '商品详情套图.zip'])
    expect(notice?.textContent).toBe('ZIP 已打包 3 / 3 张。')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    anchorClick.mockRestore()
    vi.clearAllTimers()
    vi.useRealTimers()
  }
})
