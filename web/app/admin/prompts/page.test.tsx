// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Page from './page'
import { adminRequest } from '@/lib/admin'
import type { PromptTemplate } from '@/lib/ai-settings'
import { confirmAdminNavigation } from '@/components/admin/use-unsaved-changes'

vi.mock('@/lib/admin', () => ({ adminRequest: vi.fn() }))
const originalTemplates: PromptTemplate[] = [
  {
    key: 'rewrite',
    name: '提示词优化',
    category: 'enhance',
    content: '优化原文',
    defaultContent: '默认优化',
    enabled: true,
    sortOrder: 0,
  },
  {
    key: 'reverse.style',
    name: '风格反推',
    category: 'reverse',
    content: '分析风格',
    defaultContent: '默认风格',
    enabled: true,
    sortOrder: 1,
  },
]
let root: Root
let host: HTMLDivElement
let templates: PromptTemplate[]
const request = vi.mocked(adminRequest)
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState(null, '', '/admin/prompts?template=reverse.style')
  templates = structuredClone(originalTemplates)
  request.mockReset().mockImplementation(async (_path, method, body) => {
    if (method === 'PUT') {
      const input = body as {
        key: string
        content: string
        enabled: boolean
        restoreDefault: boolean
      }
      templates = templates.map((item) =>
        item.key === input.key
          ? {
              ...item,
              content: input.restoreDefault ? item.defaultContent : input.content,
              enabled: input.enabled,
            }
          : item,
      )
      return {}
    }
    return { templates }
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})
function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  )!
}
async function edit(value: string) {
  const textarea = host.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      value,
    )
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('loads independently and opens the reverse template selected in the URL', async () => {
  await act(async () => root.render(<Page />))
  expect(host.querySelector('h1')?.textContent).toBe('系统提示词')
  expect(host.querySelector('textarea')?.value).toBe('分析风格')
  expect(request.mock.calls.every(([path]) => path === 'prompt-templates')).toBe(true)
  await edit('新的系统指令')
  await act(async () => button('保存').click())
  expect(request).toHaveBeenCalledWith('prompt-templates', 'PUT', {
    key: 'reverse.style',
    content: '新的系统指令',
    enabled: true,
    restoreDefault: false,
  })
  expect(host.textContent).toContain('提示词已保存')
  expect(host.textContent).not.toContain('未保存更改')
})
it('preserves edits when leaving is cancelled and releases the guard after saving', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await edit('保留我的修改')
  expect(confirmAdminNavigation()).toBe(false)
  expect(host.querySelector('textarea')?.value).toBe('保留我的修改')
  const link = document.createElement('a')
  link.href = '/admin/site'
  host.append(link)
  let allowed = true
  await act(async () => {
    allowed = link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )
  })
  expect(allowed).toBe(false)
  const unload = new Event('beforeunload', { cancelable: true })
  expect(window.dispatchEvent(unload)).toBe(false)
  await act(async () => button('保存').click())
  expect(confirmAdminNavigation()).toBe(true)
  expect(confirm).toHaveBeenCalledTimes(2)
})
it('restores only the selected template after confirmation', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await act(async () => button('恢复默认').click())
  expect(request.mock.calls.some(([, method]) => method === 'PUT')).toBe(false)
  confirm.mockReturnValue(true)
  await act(async () => button('恢复默认').click())
  expect(host.querySelector('textarea')?.value).toBe('默认风格')
  expect(templates[0]?.content).toBe('优化原文')
  expect(host.textContent).toContain('已恢复默认提示词')
})
