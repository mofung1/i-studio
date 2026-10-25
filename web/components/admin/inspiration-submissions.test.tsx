// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AdminInspirationSubmissions } from './inspiration-submissions'
import { adminRequest } from '@/lib/admin'
import type { InspirationSubmission } from '@/lib/inspiration-submissions'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn(), adminFetch: vi.fn() }))
vi.mock('@/components/account-provider', () => ({
  useAdminAccount: () => ({ account: { user: { id: 'reviewer' }, creditName: '积分' } }),
}))
vi.mock('@/components/inspiration-submission-cover', () => ({
  InspirationSubmissionCover: () => <div>审核封面</div>,
}))
vi.mock('@/components/library-controls', () => ({
  LibraryDialog: ({
    title,
    children,
    footer,
  }: {
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
  }) => (
    <section aria-label={title}>
      {children}
      {footer}
    </section>
  ),
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
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  ),
}))
let root: Root, host: HTMLDivElement, item: InspirationSubmission
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState(null, '', '/admin/submissions')
  localStorage.setItem('istudio-admin-token', 'reviewer-token')
  item = {
    id: 'one',
    personalPromptId: '',
    version: 1,
    publishedVersion: 0,
    publicationId: 'community_one',
    published: false,
    rewardMinor: 0,
    title: '我的案例',
    categoryId: 'c1',
    category: '摄影',
    prompt: '一只陶瓷杯',
    instructions: '柔和光线',
    requiresReference: false,
    coverPath: '/v1/admin/inspiration-submissions/one/cover?version=1',
    width: 1280,
    height: 960,
    status: 'pending',
    reviewReason: '',
    reviewedAt: null,
    createdAt: '2026-10-25T01:00:00Z',
    username: '投稿用户',
  }
  vi.mocked(adminRequest)
    .mockReset()
    .mockImplementation(async (path, method = 'GET', body) => {
      if (path.startsWith('inspiration-submissions?'))
        return { submissions: [item], total: 1, page: 1, totalPages: 1 }
      if (path === 'inspiration-submission-settings')
        return { settings: { enabled: true, dailyLimit: 5 } }
      if (path.startsWith('inspiration/categories?'))
        return { categories: [{ id: 'c1', category: '摄影' }] }
      if (path === 'inspiration-submissions/one/review' && method === 'POST') {
        const input = body as { decision: string; rewardMinor: number }
        item = {
          ...item,
          status: input.decision === 'approve' ? 'approved' : 'rejected',
          published: input.decision === 'approve',
          rewardMinor: input.rewardMinor,
        }
      }
      return { submission: item, history: [item], nextBeforeVersion: 0 }
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
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((button) => button.textContent === text)
  expect(button).toBeTruthy()
  await act(async () => button!.click())
}
async function renderAndOpen() {
  await act(async () => root.render(<AdminInspirationSubmissions />))
  await click('审核')
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('publishes without a reward by default', async () => {
  await renderAndOpen()
  expect(
    host.querySelector<HTMLInputElement>('.submission-review-panel input[type="checkbox"]')
      ?.checked,
  ).toBe(false)
  await click('通过并发布')
  expect(adminRequest).toHaveBeenCalledWith(
    'inspiration-submissions/one/review',
    'POST',
    expect.objectContaining({ decision: 'approve', grantReward: false, rewardMinor: 0 }),
  )
})
it('lets the reviewer choose an integer reward and includes it only when approving', async () => {
  await renderAndOpen()
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('.submission-review-panel input[type="checkbox"]')!
      .click(),
  )
  await fill(host.querySelector<HTMLInputElement>('#submission-reward')!, '12')
  await click('通过并奖励 12 积分')
  expect(adminRequest).toHaveBeenCalledWith(
    'inspiration-submissions/one/review',
    'POST',
    expect.objectContaining({ decision: 'approve', grantReward: true, rewardMinor: 1200 }),
  )
  expect(host.textContent).toContain('本条投稿已奖励 12 积分')
})
it('blocks fractional rewards and requires a reason before rejecting', async () => {
  await renderAndOpen()
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('.submission-review-panel input[type="checkbox"]')!
      .click(),
  )
  await fill(host.querySelector<HTMLInputElement>('#submission-reward')!, '1.5')
  await click('通过并奖励 1.5 积分')
  expect(host.textContent).toContain('奖励数量需为 1–1000000 的整数')
  await click('退回修改')
  expect(host.textContent).toContain('请填写退回或下架原因')
  expect(
    vi
      .mocked(adminRequest)
      .mock.calls.some(([path, method]) => path.endsWith('/review') && method === 'POST'),
  ).toBe(false)
})
it('does not offer another reward for a new version of a rewarded submission', async () => {
  item.rewardMinor = 500
  await renderAndOpen()
  const reward = host.querySelector<HTMLInputElement>(
    '.submission-review-panel input[type="checkbox"]',
  )!
  expect(reward.disabled).toBe(true)
  expect(host.textContent).toContain('后续版本不重复奖励')
})
