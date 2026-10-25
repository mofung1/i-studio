// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { MyInspirationSubmissions } from './inspiration-submissions'
import { SubmissionHistory } from './inspiration-submission-history'
import { parseSubmissionReward, type InspirationSubmission } from '@/lib/inspiration-submissions'
const session = vi.hoisted(() => ({ loading: false, authenticated: false }))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: session.authenticated },
    loading: session.loading,
  }),
}))
vi.mock('./inspiration-submission-cover', () => ({
  InspirationSubmissionCover: () => <div data-test="private-cover" />,
}))
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn())
  session.loading = false
  session.authenticated = false
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
it('does not fetch or render private submission controls for a guest', async () => {
  await act(async () => root.render(<MyInspirationSubmissions />))
  expect(host.textContent).toContain('登录后分享提示词')
  expect(host.querySelector('input')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it('waits for account confirmation before opening a private form', async () => {
  session.loading = true
  await act(async () => root.render(<MyInspirationSubmissions />))
  expect(host.textContent).toContain('正在确认登录状态')
  expect(host.querySelector('a')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it('loads historical private covers only when a version is expanded', async () => {
  const item = {
    version: 1,
    status: 'rejected',
    published: false,
    title: '案例',
    prompt: '说明',
    createdAt: '2026-10-25T01:00:00Z',
    reviewReason: '请补图',
  } as InspirationSubmission
  await act(async () =>
    root.render(
      <SubmissionHistory
        detail={{ submission: item, history: [item], nextBeforeVersion: 0 }}
        onMore={() => {}}
      />,
    ),
  )
  expect(host.querySelector('[data-test="private-cover"]')).toBeNull()
  const details = host.querySelector('details')!
  await act(async () => {
    details.open = true
    details.dispatchEvent(new Event('toggle'))
  })
  expect(host.querySelector('[data-test="private-cover"]')).not.toBeNull()
  expect(host.textContent).toContain('请补图')
})
it.each(['', '0', '-1', '1.2', 'Infinity', '1000001', '1e2'])(
  'rejects an invalid optional reward (%s)',
  (value) => {
    expect(parseSubmissionReward(value)).toBeNull()
  },
)
it('converts a whole credit reward to the existing minor units', () => {
  expect(parseSubmissionReward('12')).toBe(1200)
})
