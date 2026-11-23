// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { copyText } from '@/lib/clipboard'
import type { ReverseTask } from '@/lib/prompt-reverse'
import { PromptReverseDialog } from './prompt-reverse-dialog'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/clipboard', () => ({ copyText: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({ account: { authenticated: true, user: { id: 'member' } } }),
}))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(copyText).mockClear()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  })
  localStorage.setItem('istudio-access-token', 'frontend-session')
  localStorage.setItem('istudio-admin-token', 'separate-admin-session')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
})

it('loads frontend reverse capabilities and history with the frontend session only', async () => {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer frontend-session')
    const path = new URL(url).pathname
    if (path === '/v1/prompts/reverse/capabilities')
      return new Response(JSON.stringify({ available: true, reason: '', imageDetail: 'high' }))
    if (path === '/v1/prompts/reverse') return new Response(JSON.stringify({ tasks: [] }))
    throw new Error(`unexpected request: ${path}`)
  })
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(<PromptReverseDialog open request={{ revision: 1 }} onClose={() => {}} />),
  )
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('.reverse-analyze')?.textContent).toContain('开始反推')
  expect(container.querySelector('.reverse-footer')).toBeNull()
  expect(container.textContent).not.toContain('后台管理员')
  const uploadHelp = container.querySelector('#reverse-upload-help')!
  expect(uploadHelp.textContent).toContain('JPG / PNG / WebP · 最多 10 MB')
  expect(container.querySelector('.reverse-image')?.contains(uploadHelp)).toBe(false)
  expect(container.querySelector('.reverse-upload')?.getAttribute('aria-describedby')).toBe(
    uploadHelp.id,
  )
})

it('shows a user-facing unavailable message without asking for administrator login', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            new URL(url).pathname.endsWith('/capabilities')
              ? {
                  available: false,
                  reason: '图片反推服务暂不可用，请联系网站管理员',
                  imageDetail: 'auto',
                }
              : { tasks: [] },
          ),
        ),
    ),
  )
  await act(async () =>
    root.render(<PromptReverseDialog open request={{ revision: 1 }} onClose={() => {}} />),
  )
  expect(container.querySelector('.reverse-provider')?.textContent).toBe(
    '图片反推服务暂不可用，请联系网站管理员',
  )
  expect(container.querySelector<HTMLButtonElement>('.reverse-analyze')?.disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('keeps one file chooser for adding and replacing a validated reference', async () => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:reverse-preview')
      static revokeObjectURL = vi.fn()
    },
  )
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      new URL(url).pathname.endsWith('/capabilities')
        ? { available: true, reason: '', imageDetail: 'high' }
        : { tasks: [] },
    ),
  )
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(<PromptReverseDialog open request={{ revision: 1 }} onClose={() => {}} />),
  )

  async function choose(file: File) {
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
    expect(inputs).toHaveLength(1)
    const input = inputs[0]!
    expect(input.getAttribute('aria-label')).toBe('上传反推参考图片')
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  }

  await choose(new File(['gif'], 'wrong.gif', { type: 'image/gif' }))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    '请选择 JPG、PNG 或 WebP',
  )
  await choose(new File(['first'], 'first.png', { type: 'image/png' }))
  expect(container.querySelector('.reverse-image img')?.getAttribute('src')).toBe(
    'blob:reverse-preview',
  )
  expect(container.querySelector('button[aria-label="替换图片"]')).not.toBeNull()
  await choose(new File(['next'], 'next.webp', { type: 'image/webp' }))
  expect(container.querySelector('.reverse-image-meta > span')?.textContent).toBe('next.webp')
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('accepts dropped and pasted reference images without consuming text or outside paste', async () => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:reverse-preview')
      static revokeObjectURL = vi.fn()
    },
  )
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      new URL(url).pathname.endsWith('/capabilities')
        ? { available: true, reason: '', imageDetail: 'high' }
        : { tasks: [] },
    ),
  )
  vi.stubGlobal('fetch', fetch)
  await act(async () =>
    root.render(<PromptReverseDialog open request={{ revision: 1 }} onClose={() => {}} />),
  )

  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', {
    value: {
      types: ['Files'],
      files: [new File(['dropped'], 'dropped.png', { type: 'image/png' })],
    },
  })
  await act(async () => container.querySelector('.reverse-image')!.dispatchEvent(drop))
  expect(drop.defaultPrevented).toBe(true)
  expect(container.querySelector('.reverse-image-meta > span')?.textContent).toBe('dropped.png')

  async function paste(target: Element, image?: File) {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: image
          ? [{ kind: 'file', type: image.type, getAsFile: () => image }]
          : [{ kind: 'string', type: 'text/plain' }],
      },
    })
    await act(async () => target.dispatchEvent(event))
    return event.defaultPrevented
  }

  const requirements = container.querySelector('textarea')!
  const image = new File(['pasted'], 'pasted.webp', { type: 'image/webp' })
  expect(await paste(container, image)).toBe(false)
  expect(await paste(requirements)).toBe(false)
  expect(container.querySelector('.reverse-image-meta > span')?.textContent).toBe('dropped.png')
  expect(await paste(requirements, image)).toBe(true)
  expect(container.querySelector('.reverse-image-meta > span')?.textContent).toBe('pasted.webp')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('restores result actions with a completed analysis and keeps editing and rerun confirmation', async () => {
  const task: ReverseTask = {
    id: 'completed-analysis',
    status: 'succeeded',
    mode: 'scene',
    requirements: '',
    imageUrl: 'data:image/png;base64,aGVsbG8=',
    imageName: 'reference.png',
    imageWidth: 800,
    imageHeight: 600,
    createdAt: '2026-10-23T08:00:00Z',
    updatedAt: '2026-10-23T08:00:01Z',
    expiresAt: '2026-10-24T08:00:00Z',
    result: {
      promptZh: '柔和自然光下的陶瓷杯',
      promptEn: 'A ceramic cup in soft natural light',
      model: 'analysis-model',
      templateVersion: '1',
      analysis: {
        subject: '陶瓷杯',
        scene: '',
        composition: '',
        lighting: '柔和自然光',
        colors: '',
        materials: '',
        style: '',
        text: '',
      },
      uncertainties: [],
    },
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      new URL(url).pathname.endsWith('/capabilities')
        ? { available: true, reason: '', imageDetail: 'high' }
        : { tasks: [task] },
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const onApply = vi.fn()
  const onClose = vi.fn()
  await act(async () =>
    root.render(
      <PromptReverseDialog
        open
        request={{ revision: 1, currentPrompt: '已有描述', onApply }}
        onClose={onClose}
      />,
    ),
  )
  const footer = container.querySelector('.reverse-footer')!
  const button = (text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.textContent?.trim() === text,
    )!
  expect(footer).not.toBeNull()
  expect(footer.querySelector('[aria-label="应用提示词的方式"]')).not.toBeNull()
  expect(footer.querySelector<HTMLButtonElement>('[aria-label="保存到我的提示词"]')?.disabled).toBe(
    false,
  )
  await act(async () => button('复制').click())
  expect(copyText).toHaveBeenCalledWith(task.result!.promptZh)
  const checkbox = footer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  expect(checkbox.checked).toBe(true)
  await act(async () => checkbox.click())
  const prompt = container.querySelector<HTMLTextAreaElement>('.reverse-prompt')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      prompt,
      '修改后的陶瓷杯描述',
    )
    prompt.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => button('重新分析').click())
  expect(container.querySelector('.reverse-rerun-confirm')?.textContent).toContain(
    '重新分析会替换当前编辑的提示词',
  )
  expect(fetch).toHaveBeenCalledTimes(2)
  await act(async () => button('保留编辑').click())
  await act(async () => button('应用到生图').click())
  expect(onApply).toHaveBeenCalledWith({
    text: '修改后的陶瓷杯描述',
    referenceFile: undefined,
    action: 'replace',
  })
  expect(onClose).toHaveBeenCalledOnce()
})
