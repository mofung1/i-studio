// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { PersonalPromptLibrary } from './personal-prompt-library'
import { MyInspirationSubmissions } from './inspiration-submissions'
import { libraryRequest } from '@/lib/library'
import type { PersonalPrompt } from '@/lib/personal-prompts'
import type { InspirationSubmission } from '@/lib/inspiration-submissions'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/prompts',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./studio-shell', () => ({
  StudioShell: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <>
      {actions}
      {children}
    </>
  ),
}))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: true, user: { id: 'author' }, creditName: '积分' },
    loading: false,
    refresh: vi.fn(),
  }),
}))
vi.mock('@/lib/library', async (original) => ({
  ...(await original<typeof import('@/lib/library')>()),
  libraryRequest: vi.fn(),
}))
vi.mock('./authenticated-image', () => ({ AuthenticatedImage: () => <span>封面预览</span> }))
vi.mock('./inspiration-submission-cover', () => ({
  InspirationSubmissionCover: () => <span>已有封面</span>,
}))
vi.mock('./workbench/asset-picker', () => ({
  AssetPicker: ({
    onSelect,
    onClose,
  }: {
    onSelect: (files: unknown[]) => void
    onClose: () => void
  }) => (
    <button
      onClick={() => {
        onSelect([
          {
            kind: 'asset',
            assetId: 'cover-one',
            name: '封面',
            type: 'image/png',
            size: 100,
            width: 16,
            height: 16,
            contentPath: '/v1/assets/cover-one/content',
            thumbnailPath: '/v1/assets/cover-one/thumbnail',
          },
        ])
        onClose()
      }}
    >
      使用测试封面
    </button>
  ),
}))
vi.mock('./library-controls', async (original) => ({
  ...(await original<typeof import('./library-controls')>()),
  LibrarySelect: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string
    value: string
    options: Array<[string, string]>
    onChange: (value: string) => void
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">请选择</option>
      {options.map(([id, title]) => (
        <option value={id} key={id}>
          {title}
        </option>
      ))}
    </select>
  ),
}))
let root: Root, host: HTMLDivElement, source: PersonalPrompt, previous: InspirationSubmission | null
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-access-token', 'author-session')
  window.history.replaceState(null, '', '/prompts')
  source = {
    id: 'source-one',
    kind: 'prompt',
    title: '商品摄影模板',
    category: '产品摄影',
    prompt: '第一行：{{产品名称}} 的真实外观\n第二行：柔和光线，保留 $ 和换行。',
    tags: [],
    favorite: false,
    config: {},
    source: '自己整理',
    version: 2,
    createdAt: '2026-10-25T01:00:00Z',
    updatedAt: '2026-10-25T01:00:00Z',
  }
  previous = null
  router.push.mockReset()
  router.replace.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            settings: { enabled: true, dailyLimit: 5 },
            categories: [{ id: 'c1', category: '产品摄影' }],
          }),
        ),
    ),
  )
  vi.mocked(libraryRequest)
    .mockReset()
    .mockImplementation(async (path, init) => {
      if (path.startsWith('personal/prompts?'))
        return { items: [source], categories: ['产品摄影'], total: 1, nextCursor: '' }
      if (path === 'personal/prompts/source-one') return { item: source }
      if (init?.method === 'POST' || init?.method === 'PUT')
        return { submission: { id: 'submission-new' } }
      if (path.startsWith('personal/inspiration-submissions'))
        return {
          submissions: previous ? [previous] : [],
          total: previous ? 1 : 0,
          page: 1,
          totalPages: 1,
        }
      throw new Error('Unexpected request: ' + path)
    })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})
async function click(label: string) {
  const control = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === label || button.textContent === label,
  )
  expect(control).toBeTruthy()
  await act(async () => control!.click())
}
async function open() {
  await act(async () => root.render(<PersonalPromptLibrary kind="prompt" />))
  await click('提交分享 商品摄影模板')
}
it('opens on the current page with the complete selected title, prompt and matching category', async () => {
  await open()
  expect(document.querySelector<HTMLInputElement>('#submission-title')?.value).toBe(source.title)
  expect(document.querySelector<HTMLTextAreaElement>('#submission-prompt')?.value).toBe(
    source.prompt,
  )
  expect(document.querySelector<HTMLSelectElement>('select[aria-label="投稿分类"]')?.value).toBe(
    'c1',
  )
  expect(router.push).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
  expect(location.pathname).toBe('/prompts')
  expect(location.search).toBe('')
  expect(libraryRequest).toHaveBeenCalledWith(
    'personal/inspiration-submissions?personalPromptId=source-one',
    expect.anything(),
  )
})
it('keeps the footer submit button associated with the form and returns to the original list after submission', async () => {
  await open()
  await click('选择或上传封面')
  await click('使用测试封面')
  const consent = document.querySelector<HTMLInputElement>(
    '.submission-form input[type="checkbox"][required]',
  )!
  await act(async () => consent.click())
  const submit = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '提交审核',
  )!
  expect(submit.form).toBe(document.querySelector('.submission-form'))
  await act(async () => submit.click())
  const saved = vi
    .mocked(libraryRequest)
    .mock.calls.find(
      ([path, init]) => path === 'personal/inspiration-submissions' && init?.method === 'POST',
    )!
  expect(JSON.parse(saved[1]!.body as string)).toMatchObject({
    title: source.title,
    prompt: source.prompt,
    personalPromptId: source.id,
    coverAssetId: 'cover-one',
    publishConsent: true,
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(host.textContent).toContain('已提交审核')
  expect(host.querySelector('a[href="/inspire/submissions"]')).not.toBeNull()
  expect(location.pathname).toBe('/prompts')
})
it('shows the existing pending submission instead of creating a duplicate', async () => {
  previous = {
    id: 'old',
    personalPromptId: source.id,
    status: 'pending',
    version: 1,
  } as InspirationSubmission
  await open()
  expect(document.body.textContent).toContain('该提示词已提交审核')
  expect(document.querySelector('#submission-prompt')).toBeNull()
  expect(document.querySelector('a[href="/inspire/submissions"]')).not.toBeNull()
})
it('uses the latest personal text while retaining the rejected submission version and cover', async () => {
  previous = {
    id: 'old',
    personalPromptId: source.id,
    status: 'rejected',
    version: 3,
    categoryId: 'c1',
    prompt: '之前的正文',
    title: '之前的标题',
    reviewReason: '请补充内容',
    coverPath: '/v1/personal/inspiration-submissions/old/cover?version=3',
  } as InspirationSubmission
  await open()
  expect(document.querySelector<HTMLTextAreaElement>('#submission-prompt')?.value).toBe(
    source.prompt,
  )
  expect(document.body.textContent).toContain('修改并重新提交')
  expect(document.body.textContent).toContain('请补充内容')
  expect(document.body.textContent).toContain('已有封面')
})
it('reads the item payload for legacy links even when effects are replayed', async () => {
  window.history.replaceState(null, '', '/inspire/submissions?from=source-one&view=all')
  await act(async () =>
    root.render(
      <StrictMode>
        <MyInspirationSubmissions />
      </StrictMode>,
    ),
  )
  expect(document.querySelector<HTMLTextAreaElement>('#submission-prompt')?.value).toBe(
    source.prompt,
  )
  expect(location.search).toBe('?view=all')
  expect(libraryRequest).toHaveBeenCalledWith('personal/prompts/source-one', expect.anything())
})
