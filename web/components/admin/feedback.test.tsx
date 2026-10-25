// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AdminFeedback } from './feedback'
import { adminRequest } from '@/lib/admin'
import type { FeedbackItem } from '@/lib/feedback'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn(), adminFetch: vi.fn() }))
vi.mock('@/components/account-provider', () => ({
  useAdminAccount: () => ({ account: { authenticated: true, user: { id: 'admin' } } }),
}))
let root: Root, host: HTMLDivElement, item: FeedbackItem
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.setItem('istudio-admin-token', 'reviewer')
  item = {
    id: 'one',
    username: '创作者',
    content: '手机上的上传按钮需要调整',
    pagePath: '/studio',
    status: 'pending',
    imageCount: 0,
    createdAt: '2026-10-25T01:00:00Z',
    handledAt: null,
  }
  vi.mocked(adminRequest)
    .mockReset()
    .mockImplementation(async (path, method = 'GET', body) => {
      if (path.startsWith('feedback?'))
        return { feedback: [item], page: 1, pageSize: 20, total: 1, totalPages: 1 }
      if (method === 'PATCH') item = { ...item, status: (body as { status: 'handled' }).status }
      return { feedback: item, images: [] }
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
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === label,
  )!
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
it('opens feedback, marks it handled and reloads the list', async () => {
  await act(async () => root.render(<AdminFeedback />))
  await click('查看反馈')
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('/studio')
  await click('标记已处理')
  expect(adminRequest).toHaveBeenCalledWith('feedback/one', 'PATCH', { status: 'handled' })
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('恢复待处理')
  expect(
    vi.mocked(adminRequest).mock.calls.filter(([path]) => path.startsWith('feedback?')),
  ).toHaveLength(2)
})
it('keeps the detail and status when processing fails', async () => {
  const implementation = vi.mocked(adminRequest).getMockImplementation()!
  vi.mocked(adminRequest).mockImplementation((...args) =>
    args[1] === 'PATCH' ? Promise.reject(new Error('更新失败')) : implementation(...args),
  )
  await act(async () => root.render(<AdminFeedback />))
  await click('查看反馈')
  await click('标记已处理')
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
    '更新失败',
  )
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('标记已处理')
})
