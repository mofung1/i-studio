// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { InspirationSubmissionEditor } from './inspiration-submission-editor'

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          settings: { enabled: true, dailyLimit: 5 },
          categories: [{ id: 'c1', category: '产品摄影' }],
        }),
      ),
    ),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it('keeps an asynchronously selected category with the real Radix control', async () => {
  const close = vi.fn()
  await act(async () =>
    root.render(
      <InspirationSubmissionEditor
        seed={{
          id: 'source',
          title: '原始模板',
          category: '产品摄影',
          prompt: '第一行\n{{产品名称}}',
        }}
        onClose={close}
        onSaved={() => {}}
      />,
    ),
  )
  expect(document.querySelector('[aria-label="投稿分类"]')?.textContent).toContain('产品摄影')
  const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '取消',
  )!
  await act(async () => cancel.click())
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
})

it.each(['close', 'cancel', 'escape'])(
  'dismisses edited sharing content directly via %s without confirmation',
  async (action) => {
    const close = vi.fn()
    vi.mocked(confirm).mockReturnValue(false)
    await act(async () =>
      root.render(
        <InspirationSubmissionEditor
          seed={{ id: 'source', title: '原始模板', prompt: '原始正文', category: '产品摄影' }}
          onClose={close}
          onSaved={() => {}}
        />,
      ),
    )
    const title = document.querySelector<HTMLInputElement>('#submission-title')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        title,
        '已修改的标题',
      )
      title.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector<HTMLInputElement>('.submission-check input')!.click()
    })
    expect(title.value).toBe('已修改的标题')
    if (action === 'escape') {
      await act(async () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      )
    } else {
      const button =
        action === 'close'
          ? document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!
          : [...document.querySelectorAll<HTMLButtonElement>('button')].find(
              (button) => button.textContent === '取消',
            )!
      await act(async () => button.click())
    }
    expect(close).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
  },
)
