// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResultWorkspace } from './result-workspace'

const reference = vi.hoisted(() => vi.fn())
const download = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/components/authenticated-image', () => ({
  useProtectedImageUrl: (path: string) => ({ source: path, state: 'loaded', retry: vi.fn() }),
  AuthenticatedImage: ({ path, alt }: { path: string; alt: string }) => (
    <img src={path} alt={alt} />
  ),
  downloadProtectedAsset: download,
}))
vi.mock('@/components/image-comparison-button', () => ({
  ImageComparisonButton: () => <button>图片对比</button>,
}))
vi.mock('./history-drawer', () => ({ HistoryDrawer: () => null }))
vi.mock('./generation-history', () => ({ GenerationHistory: () => <div aria-label="最近生成" /> }))
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
