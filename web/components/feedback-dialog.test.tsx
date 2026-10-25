// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { FeedbackDialog } from './feedback-dialog'

vi.mock('./account-provider', () => ({ useAccount: () => ({ account: { authenticated: true } }) }))
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'feedback-one' }))),
  )
  vi.stubGlobal('confirm', vi.fn())
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:feedback-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  localStorage.setItem('istudio-access-token', 'creator-token')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function fillContent(value: string) {
  const input = document.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function selectFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function submit() {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === '提交反馈',
  )!
  await act(async () => button.click())
}
it('submits the actual footer form with three images and only the page pathname', async () => {
  await act(async () => root.render(<FeedbackDialog pagePath="/studio" onClose={() => {}} />))
  await fillContent('手机端操作按钮有些拥挤')
  const files = [1, 2, 3].map((n) => new File(['image'], `${n}.png`, { type: 'image/png' }))
  await selectFiles(files)
  await submit()
  expect(fetch).toHaveBeenCalledOnce()
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(String(url)).toMatch(/\/v1\/feedback$/)
  const body = options!.body as FormData
  expect(body.get('content')).toBe('手机端操作按钮有些拥挤')
  expect(body.get('pagePath')).toBe('/studio')
  expect(body.getAll('images')).toHaveLength(3)
  expect(document.body.textContent).toContain('反馈已收到')
})
it('retains the text, attachments and request key after a failed request and retry', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ message: '暂时无法处理' }), { status: 503 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'feedback-one' })))
  await act(async () => root.render(<FeedbackDialog pagePath="/assets" onClose={() => {}} />))
  await fillContent('希望改进筛选')
  await selectFiles([new File(['image'], 'screen.png', { type: 'image/png' })])
  await submit()
  expect(document.querySelector('textarea')?.value).toBe('希望改进筛选')
  expect(document.querySelectorAll('.feedback-image')).toHaveLength(1)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('暂时无法处理')
  await submit()
  const first = vi.mocked(fetch).mock.calls[0]![1]!.body as FormData
  const next = vi.mocked(fetch).mock.calls[1]![1]!.body as FormData
  expect(first.get('requestKey')).toBe(next.get('requestKey'))
  expect(next.getAll('images')).toHaveLength(1)
})
it('rejects excess, unsupported or oversized images and supports removal', async () => {
  await act(async () => root.render(<FeedbackDialog pagePath="/studio" onClose={() => {}} />))
  const image = new File(['image'], 'one.png', { type: 'image/png' })
  await selectFiles([image, image, image, image])
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('最多上传 3 张')
  expect(document.querySelectorAll('.feedback-image')).toHaveLength(0)
  await selectFiles([new File(['svg'], 'one.svg', { type: 'image/svg+xml' })])
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('仅支持')
  const large = new File(['image'], 'big.png', { type: 'image/png' })
  Object.defineProperty(large, 'size', { value: 5 * 1024 * 1024 + 1 })
  await selectFiles([large])
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('5MB')
  await selectFiles([image, image, image])
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="移除第 2 张图片"]')!.click(),
  )
  expect(document.querySelectorAll('.feedback-image')).toHaveLength(2)
  expect(URL.revokeObjectURL).toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it('closes edited feedback directly and ignores a response for a changed account', async () => {
  const close = vi.fn()
  await act(async () => root.render(<FeedbackDialog pagePath="/studio" onClose={close} />))
  await fillContent('保留内容')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click())
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
  let finish!: (response: Response) => void
  vi.mocked(fetch).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  await submit()
  localStorage.setItem('istudio-access-token', 'other-account')
  await act(async () => finish(new Response(JSON.stringify({ id: 'old-feedback' }))))
  expect(document.body.textContent).not.toContain('反馈已收到')
})
