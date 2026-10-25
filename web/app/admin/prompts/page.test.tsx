// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Page from './page'
import { adminRequest } from '@/lib/admin'
import type { PromptTemplate } from '@/lib/ai-settings'

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
it('keeps a draft when switching templates and does not intercept ordinary navigation', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await edit('保留我的修改')
  const select = async (name: string) => {
    const search = host.querySelector<HTMLInputElement>('[aria-label="搜索内置提示词"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, name)
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => host.querySelector<HTMLButtonElement>('.prompt-template-item')!.click())
  }
  await select('提示词优化')
  expect(host.querySelector('textarea')?.value).toBe('优化原文')
  await select('风格反推')
  expect(host.querySelector('textarea')?.value).toBe('保留我的修改')
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)
  expect(confirm).not.toHaveBeenCalled()
})
it('fills defaults locally and saves only after the explicit Save action', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await act(async () => button('填入默认内容').click())
  expect(request.mock.calls.some(([, method]) => method === 'PUT')).toBe(false)
  expect(host.querySelector('textarea')?.value).toBe('默认风格')
  expect(host.textContent).toContain('未保存更改')
  await act(async () => button('保存').click())
  expect(templates[0]?.content).toBe('优化原文')
  expect(host.textContent).toContain('提示词已保存')
  expect(confirm).not.toHaveBeenCalled()
})
