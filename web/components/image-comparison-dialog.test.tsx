// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ImageComparisonDialog } from './image-comparison-dialog'

vi.mock('./library-controls', () => ({
  LibrarySelect: ({
    label,
    value,
    options,
    onChange,
  }: ComponentProps<typeof import('./library-controls').LibrarySelect>) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([path, name]) => (
        <option key={path} value={path}>
          {name}
        </option>
      ))}
    </select>
  ),
}))

let container: HTMLDivElement
let root: Root
let tokenNumber = 0
const originals = [1, 2, 3, 4].map((index) => ({
  path: `/v1/assets/original-${index}/content`,
  label: `商品原图 ${index}`,
  isProductOriginal: true,
}))
const result = { path: '/v1/assets/result/content', label: '当前成片' }
const manual = { path: '/v1/assets/reference/content', label: '参考原图' }
const imageResponse = () => new Response('image', { headers: { 'Content-Type': 'image/png' } })
const missingResponse = () => new Response(null, { status: 404 })
const image = (side: 'A' | 'B') =>
  document.querySelector<HTMLImageElement>(`img[alt^="图片 ${side}："]`)!
const selection = (side: 'A' | 'B') =>
  document.querySelector<HTMLSelectElement>(`select[aria-label="对比图片 ${side}"]`)!

function trackRequests(reply: (path: string) => Response | Promise<Response>) {
  const paths: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname
      paths.push(path)
      return reply(path)
    }),
  )
  return paths
}

async function openDialog(originalFallbackPaths = originals.slice(1).map(({ path }) => path)) {
  await act(async () =>
    root.render(
      <ImageComparisonDialog
        candidates={[...originals, result, manual]}
        initialLeft={originals[0]!.path}
        initialRight={result.path}
        originalFallbackPaths={originalFallbackPaths}
        onClose={vi.fn()}
      />,
    ),
  )
}

async function finishImageLoad(side: 'A' | 'B') {
  const element = image(side)
  Object.defineProperties(element, {
    naturalWidth: { configurable: true, value: 640 },
    naturalHeight: { configurable: true, value: 480 },
  })
  await act(async () => element.dispatchEvent(new Event('load')))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let blobNumber = 0
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = () => `blob:comparison-${++blobNumber}`
      static revokeObjectURL = vi.fn()
    },
  )
  localStorage.setItem('istudio-access-token', `comparison-test-${++tokenNumber}`)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.removeItem('istudio-access-token')
  vi.unstubAllGlobals()
})

it('advances past an unavailable default original and an undecodable backup while keeping the result', async () => {
  const [first, second, third, fourth] = originals
  const requests = trackRequests((path) =>
    path === first!.path ? missingResponse() : imageResponse(),
  )

  await openDialog()
  expect(selection('A').value).toBe(second!.path)
  expect(image('A').src).toMatch(/^blob:/)
  expect(selection('B').value).toBe(result.path)
  await act(async () => image('A').dispatchEvent(new Event('error')))

  expect(selection('A').value).toBe(third!.path)
  expect(selection('B').value).toBe(result.path)
  expect(image('A').alt).toContain(third!.label)
  expect(image('B').alt).toContain(result.label)
  await finishImageLoad('A')
  await finishImageLoad('B')
  expect(document.querySelector('.comparison-feedback')).toBeNull()
  expect(requests.filter((path) => path !== result.path)).toEqual([
    first!.path,
    second!.path,
    third!.path,
  ])
  expect(requests).not.toContain(fourth!.path)
  expect(requests.filter((path) => path === result.path)).toHaveLength(1)
})

it('offers a manual retry after exhausting the default originals', async () => {
  const [first, second] = originals
  let recovered = false
  const requests = trackRequests((path) =>
    path === result.path || recovered ? imageResponse() : missingResponse(),
  )

  await openDialog([second!.path])
  expect(selection('B').value).toBe(result.path)
  const retry = [
    ...document.querySelectorAll<HTMLButtonElement>('.comparison-feedback button'),
  ].find((button) => button.textContent?.includes('重试图片 A'))
  expect(retry).toBeDefined()
  expect(requests.filter((path) => path !== result.path)).toEqual([first!.path, second!.path])

  recovered = true
  await act(async () => retry!.click())
  await finishImageLoad('A')
  await finishImageLoad('B')
  expect(document.querySelector('.comparison-feedback')).toBeNull()
  expect(requests).toHaveLength(4)
  expect([first!.path, second!.path]).toContain(requests.at(-1))
})

it('respects a manual choice when the pending default original fails', async () => {
  const [first] = originals
  let failDefault!: (response: Response) => void
  const pendingDefault = new Promise<Response>((resolve) => {
    failDefault = resolve
  })
  const requests = trackRequests((path) =>
    path === first!.path ? pendingDefault : imageResponse(),
  )

  await openDialog()
  await act(async () => {
    const picker = selection('A')
    picker.value = manual.path
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => failDefault(missingResponse()))
  await finishImageLoad('A')
  await finishImageLoad('B')
  expect(selection('A').value).toBe(manual.path)
  expect(selection('B').value).toBe(result.path)
  expect(document.querySelector('.comparison-feedback')).toBeNull()
  expect(requests.filter((path) => path !== result.path)).toEqual([first!.path, manual.path])
})
