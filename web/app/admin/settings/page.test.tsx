// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Page from './page'
import { adminRequest } from '@/lib/admin'
import type { AIEndpoint } from '@/lib/ai-settings'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/lib/admin', async (original) => ({
  ...(await original<object>()),
  adminRequest: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ getAdminAccessToken: () => 'test-admin-token' }))
vi.mock('@/components/prompt-template-browser', () => ({ PromptTemplateBrowser: () => null }))
vi.mock('@/components/site-settings-panel', () => ({ SiteSettingsPanel: () => null }))
vi.mock('@/components/prompt-reverse-settings-panel', async () => {
  const { useState } = await import('react')
  return {
    PromptReverseSettingsPanel: () => {
      const [value, setValue] = useState('原始草稿')
      return (
        <input
          aria-label="反推草稿"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    },
  }
})
const endpoint: AIEndpoint = {
  id: 'official',
  name: '已有渠道',
  purpose: 'image',
  protocol: 'openai_images',
  baseUrl: 'https://fixture.example/v1',
  model: 'fixture-image',
  timeoutSeconds: 300,
  capabilities: {},
  enabled: true,
  isDefault: false,
  apiKeyConfigured: true,
  apiKeyMasked: '****test',
  updatedAt: '2026-10-19T00:00:00Z',
}
let root: Root
let container: HTMLDivElement
const request = vi.mocked(adminRequest)
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  request.mockReset()
  request.mockImplementation(async (path) => {
    if (path === 'ai-endpoints') return { endpoints: [endpoint], canManage: true }
    if (path === 'prompt-templates') return { templates: [] }
    return { success: true, message: '连接成功', model: 'fixture-image', responseTimeMs: 12 }
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function button(text: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.textContent?.trim() === text,
  )!
}
function inputFor(label: string) {
  return Array.from(document.querySelectorAll('label'))
    .find((item) => item.querySelector('span')?.textContent === label)!
    .querySelector('input')!
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('fills official presets without a key or guessed model', async () => {
  await act(async () => root.render(<Page />))
  await act(async () => button('添加生图渠道').click())
  await act(async () => button('Gemini 官方').click())
  expect(inputFor('名称').value).toBe('Gemini 官方')
  expect(inputFor('API 地址（Base URL）').value).toBe(
    'https://generativelanguage.googleapis.com/v1beta',
  )
  expect(inputFor('API Key').value).toBe('')
  expect(inputFor('测试模型 ID（可选）').value).toBe('')
  await change(inputFor('API Key'), 'wrong-provider-key')
  await change(inputFor('测试模型 ID（可选）'), 'other-provider-model')
  await act(async () => button('OpenAI 官方').click())
  expect(inputFor('API 地址（Base URL）').value).toBe('https://api.openai.com/v1')
  expect(inputFor('API Key').value).toBe('')
  expect(inputFor('测试模型 ID（可选）').value).toBe('')
  await change(inputFor('API Key'), 'mock-key')
  await act(async () =>
    document
      .querySelector('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(request).toHaveBeenCalledWith(
    'ai-endpoints',
    'POST',
    expect.objectContaining({
      name: 'OpenAI 官方',
      protocol: 'openai_images',
      apiKey: 'mock-key',
      model: '',
    }),
  )
  expect(container.textContent).toContain('生图渠道已保存')
})
it('distinguishes connection testing from paid image generation and shows local failures', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await act(async () => button('测试连接').click())
  expect(request).toHaveBeenCalledWith('ai-endpoints/official/test', 'POST', {
    mode: 'connection',
    confirmCost: false,
  })
  expect(container.textContent).toContain('连接测试通过')
  const before = request.mock.calls.length
  await act(async () => button('测试生图（可能收费）').click())
  expect(confirm).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('确认真实生图测试')
  await act(async () => button('取消').click())
  expect(request.mock.calls.length).toBe(before)
  request.mockRejectedValueOnce(new Error('Mock 渠道连接失败'))
  await act(async () => button('测试连接').click())
  expect(container.querySelector('.endpoint-row')?.textContent).toContain('Mock 渠道连接失败')
})
it('keeps the stored key blank when editing and carries the concurrency timestamp', async () => {
  await act(async () => root.render(<Page />))
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="编辑 已有渠道"]')!.click(),
  )
  expect(inputFor('API Key').value).toBe('')
  await change(inputFor('名称'), '修改名称')
  await act(async () =>
    document
      .querySelector('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(request).toHaveBeenCalledWith(
    'ai-endpoints/official',
    'PUT',
    expect.objectContaining({ name: '修改名称', apiKey: '', updatedAt: endpoint.updatedAt }),
  )
})

it('keeps only AI service and reverse categories after moving prompt and site settings', async () => {
  await act(async () => root.render(<Page />))
  const tabs = [...container.querySelectorAll('[role="tab"]')].map((item) =>
    item.textContent?.trim(),
  )
  expect(tabs).toEqual(['AI 服务', '图片反推'])
  expect(container.querySelector('h1')?.textContent).toBe('AI 服务')
})

it('switches settings tabs without interruption and retains the reverse draft', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  const tab = async (name: string) => {
    const element = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (e) => e.textContent === name,
    )!
    await act(async () => element.click())
    expect(element.getAttribute('aria-selected')).toBe('true')
  }
  await tab('图片反推')
  const draft = container.querySelector<HTMLInputElement>('[aria-label="反推草稿"]')!
  await change(draft, '未保存的反推草稿')
  await tab('AI 服务')
  expect(draft.closest('[hidden]')).toBeTruthy()
  await tab('图片反推')
  expect(container.querySelector<HTMLInputElement>('[aria-label="反推草稿"]')?.value).toBe(
    '未保存的反推草稿',
  )
  expect(confirm).not.toHaveBeenCalled()
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)
})
it('allows the first tab click while a channel connection check is pending', async () => {
  let complete!: (result: unknown) => void
  await act(async () => root.render(<Page />))
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  await act(async () => button('测试连接').click())
  const reverse = button('图片反推')
  expect(reverse.disabled).toBe(false)
  await act(async () => {
    reverse.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    reverse.focus()
    reverse.click()
  })
  expect(reverse.getAttribute('aria-selected')).toBe('true')
  expect(container.querySelector('[aria-label="反推草稿"]')).not.toBeNull()
  await act(async () => complete({ success: true, message: '连接成功', responseTimeMs: 12 }))
  expect(reverse.getAttribute('aria-selected')).toBe('true')
  await act(async () => button('AI 服务').click())
  expect(container.textContent).toContain('连接测试通过')
})
it('deletes an AI service only after the in-app destructive confirmation', async () => {
  await act(async () => root.render(<Page />))
  const remove = () => container.querySelector<HTMLButtonElement>('[aria-label="删除 已有渠道"]')!
  await act(async () => remove().click())
  expect(request.mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
  await act(async () => button('取消').click())
  expect(request.mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
  await act(async () => remove().click())
  await act(async () => button('删除服务').click())
  expect(request).toHaveBeenCalledWith('ai-endpoints/official', 'DELETE')
})
