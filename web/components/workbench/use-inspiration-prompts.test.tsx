// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useInspirationPrompts, type InspirationPrompt } from './use-inspiration-prompts'

let root: Root
let host: HTMLDivElement
let gallery: ReturnType<typeof useInspirationPrompts>
const categories = [
  { id: 'commerce', category: '电商', count: 20 },
  { id: 'illustration', category: '插画', count: 6 },
]
function prompt(id: string, title = id): InspirationPrompt {
  return {
    id,
    title,
    category: '电商',
    prompt: `描述 ${id}`,
    source: '',
    imageUrl: '',
    width: 800,
    height: 600,
    sortOrder: 0,
  }
}
const firstPage = Array.from({ length: 24 }, (_, index) => prompt(`prompt-${index + 1}`))
function listResponse(prompts = firstPage, total = 26, page = 1) {
  return new Response(JSON.stringify({ prompts, total, page, pageSize: 24 }))
}
function categoryResponse() {
  return new Response(JSON.stringify({ categories }))
}
function urlOf(input: RequestInfo | URL) {
  return new URL(String(input), 'https://istudio.local')
}
function Harness() {
  gallery = useInspirationPrompts()
  return <output>{gallery.prompts.map((item) => item.id).join(',')}</output>
}
async function render() {
  await act(async () => root.render(<Harness />))
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function listRequests() {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => urlOf(input))
    .filter((url) => url.pathname.endsWith('/prompts'))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      urlOf(input).pathname.endsWith('/categories') ? categoryResponse() : listResponse(),
    ),
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps API category order and totals, appending the next page without duplicate cards', async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    return url.searchParams.get('page') === '2'
      ? listResponse(
          [prompt('prompt-24', '更新的标题'), prompt('prompt-25'), prompt('prompt-26')],
          26,
          2,
        )
      : listResponse()
  })
  await render()
  expect(gallery.categories).toEqual(categories)
  expect(gallery.allTotal).toBe(26)
  expect(gallery.total).toBe(26)
  expect(gallery.hasMore).toBe(true)
  await act(async () => gallery.loadMore())
  expect(gallery.prompts).toHaveLength(26)
  expect(gallery.prompts[23]?.title).toBe('更新的标题')
  expect(gallery.hasMore).toBe(false)
  expect(listRequests().map((url) => url.searchParams.get('page'))).toEqual(['1', '2'])
})

it('stops after the last server page even when overlapping pages leave fewer unique cards than total', async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    return url.searchParams.get('page') === '2'
      ? listResponse(
          Array.from({ length: 24 }, (_, index) => prompt(`prompt-${index + 24}`)),
          48,
          2,
        )
      : listResponse(firstPage, 48)
  })
  await render()
  await act(async () => gallery.loadMore())
  expect(gallery.prompts).toHaveLength(47)
  expect(gallery.total).toBe(48)
  expect(gallery.hasMore).toBe(false)
  await act(async () => gallery.loadMore())
  expect(listRequests().map((url) => url.searchParams.get('page'))).toEqual(['1', '2'])
})

it('stops on an empty page even if the public API still reports a larger total', async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    return url.searchParams.get('page') === '2'
      ? listResponse([], 72, 2)
      : listResponse(firstPage, 72)
  })
  await render()
  await act(async () => gallery.loadMore())
  expect(gallery.prompts).toEqual(firstPage)
  expect(gallery.hasMore).toBe(false)
  await act(async () => gallery.loadMore())
  expect(listRequests()).toHaveLength(2)
})

it('uses the current response total when newly published prompts add a last page', async () => {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    if (url.searchParams.get('page') === '2')
      return listResponse(
        Array.from({ length: 24 }, (_, index) => prompt(`prompt-${index + 24}`)),
        49,
        2,
      )
    if (url.searchParams.get('page') === '3') return listResponse([prompt('prompt-48')], 49, 3)
    return listResponse(firstPage, 48)
  })
  await render()
  await act(async () => gallery.loadMore())
  expect(gallery.hasMore).toBe(true)
  expect(gallery.total).toBe(49)
  await act(async () => gallery.loadMore())
  expect(gallery.prompts).toHaveLength(48)
  expect(gallery.hasMore).toBe(false)
  await act(async () => gallery.loadMore())
  expect(listRequests().map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '3'])
})

it('combines category and debounced search and ignores a late response from the old filter', async () => {
  const stale = deferred<Response>()
  let staleSignal: AbortSignal | null | undefined
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    if (!url.searchParams.has('category')) return listResponse()
    if (!url.searchParams.has('q')) {
      staleSignal = init?.signal
      return stale.promise
    }
    return listResponse([prompt('matched')], 1)
  })
  await render()
  await act(async () => gallery.changeCategory('插画'))
  await act(async () => gallery.setSearchInput('自然光'))
  await act(async () => vi.advanceTimersByTimeAsync(349))
  expect(listRequests().at(-1)?.searchParams.has('q')).toBe(false)
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(staleSignal?.aborted).toBe(true)
  expect(listRequests().at(-1)?.searchParams.get('category')).toBe('插画')
  expect(listRequests().at(-1)?.searchParams.get('q')).toBe('自然光')
  expect(gallery.prompts.map((item) => item.id)).toEqual(['matched'])
  await act(async () => stale.resolve(listResponse([prompt('stale')])))
  expect(gallery.prompts.map((item) => item.id)).toEqual(['matched'])
  expect(gallery.category).toBe('插画')
  expect(gallery.total).toBe(1)
  expect(gallery.allTotal).toBe(26)
})

it('retains loaded cards after a next-page failure and retries exactly that page', async () => {
  let attempts = 0
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    if (url.searchParams.get('page') === '2') {
      attempts++
      if (attempts === 1) return new Response('{}', { status: 503 })
      return listResponse([prompt('prompt-25'), prompt('prompt-26')], 26, 2)
    }
    return listResponse()
  })
  await render()
  await act(async () => gallery.loadMore())
  expect(gallery.prompts).toEqual(firstPage)
  expect(gallery.error).toBe('')
  expect(gallery.loadMoreError).toContain('加载失败')
  expect(gallery.hasMore).toBe(true)
  await act(async () => gallery.loadMore())
  expect(listRequests().map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '2'])
  expect(gallery.loadMoreError).toBe('')
  expect(gallery.prompts).toHaveLength(26)
})

it('does not start duplicate pagination requests when load-more is clicked twice', async () => {
  const nextPage = deferred<Response>()
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    return url.searchParams.get('page') === '2' ? nextPage.promise : listResponse()
  })
  await render()
  await act(async () => {
    gallery.loadMore()
    gallery.loadMore()
  })
  expect(listRequests().map((url) => url.searchParams.get('page'))).toEqual(['1', '2'])
  expect(gallery.isLoading).toBe(true)
  await act(async () =>
    nextPage.resolve(listResponse([prompt('prompt-25'), prompt('prompt-26')], 26, 2)),
  )
  expect(gallery.prompts).toHaveLength(26)
})

it('reports an initial list error independently and retries the selected filter', async () => {
  let failed = false
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = urlOf(input)
    if (url.pathname.endsWith('/categories')) return categoryResponse()
    if (url.searchParams.get('category') === '电商' && !failed) {
      failed = true
      throw new Error('Network unreachable')
    }
    return listResponse()
  })
  await render()
  await act(async () => gallery.changeCategory('电商'))
  expect(gallery.prompts).toEqual([])
  expect(gallery.error).toContain('检查网络')
  expect(gallery.loadMoreError).toBe('')
  await act(async () => gallery.reload())
  expect(gallery.error).toBe('')
  expect(gallery.prompts).toHaveLength(24)
  expect(listRequests().at(-1)?.searchParams.get('category')).toBe('电商')
  expect(listRequests().at(-1)?.searchParams.get('page')).toBe('1')
})

it('exposes category failures and retries them without discarding the gallery', async () => {
  let attempts = 0
  vi.mocked(fetch).mockImplementation(async (input) => {
    if (!urlOf(input).pathname.endsWith('/categories')) return listResponse()
    attempts++
    return attempts === 1 ? new Response('{}', { status: 503 }) : categoryResponse()
  })
  await render()
  expect(gallery.categoriesLoading).toBe(false)
  expect(gallery.categoriesError).toContain('分类')
  expect(gallery.prompts).toHaveLength(24)
  await act(async () => gallery.reloadCategories())
  expect(gallery.categoriesError).toBe('')
  expect(gallery.categories).toEqual(categories)
  expect(listRequests()).toHaveLength(1)
})

it('resets both filters immediately and does not replay a pending search debounce', async () => {
  await render()
  await act(async () => gallery.changeCategory('插画'))
  await act(async () => gallery.setSearchInput('旧关键词'))
  await act(async () => vi.advanceTimersByTimeAsync(350))
  await act(async () => gallery.setSearchInput('尚未提交的关键词'))
  await act(async () => gallery.resetFilters())
  expect(gallery.category).toBe('')
  expect(gallery.searchInput).toBe('')
  expect(gallery.query).toBe('')
  expect(listRequests().at(-1)?.searchParams.has('category')).toBe(false)
  expect(listRequests().at(-1)?.searchParams.has('q')).toBe(false)
  const count = listRequests().length
  await act(async () => vi.advanceTimersByTimeAsync(500))
  expect(listRequests()).toHaveLength(count)
})

it('aborts superseded category requests and ignores their late responses', async () => {
  const old = deferred<Response>()
  let categoryRequests = 0
  let oldSignal: AbortSignal | null | undefined
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!urlOf(input).pathname.endsWith('/categories')) return listResponse()
    categoryRequests++
    if (categoryRequests === 1) {
      oldSignal = init?.signal
      return old.promise
    }
    return categoryResponse()
  })
  await render()
  expect(gallery.categoriesLoading).toBe(true)
  await act(async () => gallery.reloadCategories())
  expect(oldSignal?.aborted).toBe(true)
  await act(async () =>
    old.resolve(new Response(JSON.stringify({ categories: [{ category: '旧分类', count: 1 }] }))),
  )
  expect(gallery.categories).toEqual(categories)
  expect(gallery.categoriesLoading).toBe(false)
})
