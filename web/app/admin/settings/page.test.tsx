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
vi.mock('@/components/prompt-reverse-settings-panel', async () => {
  const { useState } = await import('react')
  return {
    PromptReverseSettingsPanel: ({ onOpenServices }: { onOpenServices: () => void }) => {
      const [value, setValue] = useState('原始草稿')
      return (
        <>
          <input
            aria-label="反推草稿"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button onClick={onOpenServices}>管理识图服务</button>
        </>
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
const promptEndpoint: AIEndpoint = {
  ...endpoint,
  id: 'prompt-default',
  name: '默认识图助手',
  purpose: 'prompt',
  protocol: 'openai_chat',
  model: 'fixture-vision',
  capabilities: { vision: true },
  isDefault: true,
}
let root: Root
let container: HTMLDivElement
const request = vi.mocked(adminRequest)

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState(null, '', '/admin/settings')
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

function button(text: string, scope: ParentNode = document) {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.textContent?.trim() === text,
  )!
}
function inputFor(label: string) {
  const fieldLabel = Array.from(document.querySelectorAll<HTMLLabelElement>('label')).find(
    (item) => item.textContent?.trim() === label,
  )!
  return document.getElementById(fieldLabel.htmlFor) as HTMLInputElement
}
function service(name = endpoint.name) {
  return [...container.querySelectorAll('article')].find(
    (item) => item.getAttribute('aria-label') === name,
  )!
}
async function expandDetails(scope: ParentNode) {
  await act(async () => scope.querySelector('summary')!.click())
}
async function change(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submitEditor() {
  await act(async () =>
    document
      .querySelector('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
async function tab(name: string) {
  const element = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  )!
  await act(async () => element.click())
  expect(element.getAttribute('aria-selected')).toBe('true')
}

it('fills official presets without a key or guessed model and saves without a test model', async () => {
  await act(async () => root.render(<Page />))
  await act(async () => button('添加生图渠道').click())
  await act(async () => button('Gemini 官方').click())
  expect(inputFor('名称').value).toBe('Gemini 官方')
  expect(inputFor('API 地址（Base URL）').value).toBe(
    'https://generativelanguage.googleapis.com/v1beta',
  )
  expect(inputFor('API Key').value).toBe('')
  await expandDetails(document.querySelector('[role="dialog"]')!)
  expect(inputFor('测试模型 ID（可选）').value).toBe('')
  await change(inputFor('API Key'), 'wrong-provider-key')
  await change(inputFor('测试模型 ID（可选）'), 'other-provider-model')
  await act(async () => button('OpenAI 官方').click())
  expect(inputFor('API 地址（Base URL）').value).toBe('https://api.openai.com/v1')
  expect(inputFor('API Key').value).toBe('')
  expect(inputFor('测试模型 ID（可选）').value).toBe('')
  await change(inputFor('API Key'), 'mock-key')
  await submitEditor()
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
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(container.textContent).toContain('生图渠道已保存')
  expect(container.textContent).toContain('绑定渠道、填写上游模型 ID 并上架')
})

it('distinguishes connection checks from paid generation and reports failures on the service', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await act(async () => button('测试连接').click())
  expect(request).toHaveBeenCalledWith('ai-endpoints/official/test', 'POST', {
    mode: 'connection',
    confirmCost: false,
  })
  expect(service().textContent).toContain('连接测试通过')
  expect(service().textContent).toContain('尚未验证实际生成或识图能力')
  const before = request.mock.calls.length
  await expandDetails(service())
  await act(async () => button('测试生图（可能收费）', service()).click())
  expect(confirm).not.toHaveBeenCalled()
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain('确认真实生图测试')
  await act(async () => button('取消', dialog).click())
  expect(request.mock.calls.length).toBe(before)
  request.mockRejectedValueOnce(new Error('Mock 渠道连接失败'))
  await act(async () => button('测试连接', service()).click())
  expect(service().textContent).toContain('Mock 渠道连接失败')
})

it('keeps an undisclosed stored key blank when editing and carries the concurrency timestamp', async () => {
  await act(async () => root.render(<Page />))
  await act(async () => button('编辑', service()).click())
  expect(inputFor('API Key').value).toBe('')
  await change(inputFor('名称'), '修改名称')
  await submitEditor()
  expect(request).toHaveBeenCalledWith(
    'ai-endpoints/official',
    'PUT',
    expect.objectContaining({ name: '修改名称', apiKey: '', updatedAt: endpoint.updatedAt }),
  )
})

it('separates image, prompt and reverse configuration and explains the image setup sequence', async () => {
  await act(async () => root.render(<Page />))
  const tabs = [...container.querySelectorAll('[role="tab"]')].map((item) =>
    item.textContent?.trim(),
  )
  expect(tabs).toEqual(['生图渠道', '提示词与识图', '图片反推'])
  expect(container.querySelector('h1')?.textContent).toBe('AI 服务')
  const steps = container.querySelector('[aria-label="生图配置顺序"]')!
  expect(steps.textContent).toContain('连接生图渠道')
  expect(steps.textContent).toContain('发布前台模型')
  expect(steps.querySelector('a')?.getAttribute('href')).toBe('/admin/models')
  expect(request.mock.calls.some(([path]) => path === 'prompt-templates')).toBe(false)
})

it('switches tabs without interruption and retains the reverse draft through its service-management link', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await act(async () => root.render(<Page />))
  await tab('图片反推')
  const draft = container.querySelector<HTMLInputElement>('[aria-label="反推草稿"]')!
  await change(draft, '未保存的反推草稿')
  await act(async () => button('管理识图服务').click())
  expect(button('提示词与识图').getAttribute('aria-selected')).toBe('true')
  expect(new URLSearchParams(window.location.search).get('tab')).toBe('prompt')
  expect(draft.closest('[hidden]')).toBeTruthy()
  await tab('生图渠道')
  await tab('图片反推')
  expect(container.querySelector<HTMLInputElement>('[aria-label="反推草稿"]')?.value).toBe(
    '未保存的反推草稿',
  )
  expect(request.mock.calls.filter(([path]) => path === 'prompt-templates')).toHaveLength(1)
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
  await tab('生图渠道')
  expect(service().textContent).toContain('连接测试通过')
})

it('deletes a service only after confirming the destructive action in the dialog', async () => {
  await act(async () => root.render(<Page />))
  await expandDetails(service())
  await act(async () => button('删除服务', service()).click())
  expect(request.mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
  await act(async () => button('取消', document.querySelector('[role="dialog"]')!).click())
  expect(request.mock.calls.some(([, method]) => method === 'DELETE')).toBe(false)
  await act(async () => button('删除服务', service()).click())
  await act(async () => button('删除服务', document.querySelector('[role="dialog"]')!).click())
  expect(request).toHaveBeenCalledWith('ai-endpoints/official', 'DELETE')
})

it('shows a retryable loading failure instead of an empty channel list', async () => {
  request.mockRejectedValueOnce(new Error('无法读取渠道配置'))
  await act(async () => root.render(<Page />))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('无法读取渠道配置')
  expect(container.querySelector('[aria-label="生图渠道列表"]')).toBeNull()
  expect(container.textContent).not.toContain('从连接第一个生图渠道开始')
  expect(button('添加生图渠道')).toBeUndefined()
  await act(async () => button('重新读取').click())
  expect(service()).toBeDefined()
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('isolates reverse-template loading failures and retries them without losing the channel list', async () => {
  let templateAttempt = 0
  request.mockImplementation(async (path) => {
    if (path === 'ai-endpoints') return { endpoints: [endpoint], canManage: true }
    if (path === 'prompt-templates') {
      if (++templateAttempt === 1) throw new Error('模板暂不可用')
      return { templates: [] }
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  await act(async () => root.render(<Page />))
  expect(service()).toBeDefined()
  expect(templateAttempt).toBe(0)
  await tab('图片反推')
  expect(container.textContent).toContain('反推模板读取失败：模板暂不可用')
  expect(container.querySelector('[aria-label="反推草稿"]')).toBeNull()
  await tab('生图渠道')
  expect(service()).toBeDefined()
  await tab('图片反推')
  await act(async () => button('重新读取反推配置').click())
  expect(container.querySelector('[aria-label="反推草稿"]')).not.toBeNull()
  expect(templateAttempt).toBe(2)
  await tab('生图渠道')
  expect(service()).toBeDefined()
})

it('prevents connection and generation tests for a disabled service', async () => {
  request.mockResolvedValueOnce({ endpoints: [{ ...endpoint, enabled: false }], canManage: true })
  await act(async () => root.render(<Page />))
  expect(button('测试连接', service()).disabled).toBe(true)
  await expandDetails(service())
  expect(button('测试生图（可能收费）', service()).disabled).toBe(true)
  expect(service().textContent).toContain('此服务已停用，启用后才能测试')
  await act(async () => button('测试连接', service()).click())
  expect(request.mock.calls.some(([path]) => path.endsWith('/test'))).toBe(false)
})

it('shows the default prompt service, changes it, and edits with the refreshed concurrency timestamp', async () => {
  let switched = false
  const alternate = {
    ...promptEndpoint,
    id: 'prompt-alternate',
    name: '备用识图助手',
    isDefault: false,
  }
  const refreshedAt = '2026-11-16T06:00:00Z'
  request.mockImplementation(async (path, method) => {
    if (path === 'ai-endpoints')
      return {
        endpoints: [
          { ...promptEndpoint, isDefault: !switched },
          {
            ...alternate,
            isDefault: switched,
            updatedAt: switched ? refreshedAt : endpoint.updatedAt,
          },
        ],
        canManage: true,
      }
    if (path === 'ai-endpoints/prompt-alternate/default' && method === 'POST') {
      switched = true
      return { success: true }
    }
    if (path === 'ai-endpoints/prompt-alternate' && method === 'PUT') return { success: true }
    throw new Error(`Unexpected request: ${path}`)
  })
  await act(async () => root.render(<Page />))
  await tab('提示词与识图')
  expect(container.textContent).toContain('当前默认服务默认识图助手')
  expect(service(promptEndpoint.name).textContent).toContain('默认服务')
  expect(service(promptEndpoint.name).textContent).toContain('支持识图')
  expect(button('设为默认', service(promptEndpoint.name))).toBeUndefined()
  await act(async () => button('设为默认', service(alternate.name)).click())
  expect(request).toHaveBeenCalledWith('ai-endpoints/prompt-alternate/default', 'POST')
  expect(container.textContent).toContain('当前默认服务备用识图助手')
  expect(service(alternate.name).textContent).toContain('默认服务')
  await act(async () => button('编辑', service(alternate.name)).click())
  await change(inputFor('名称'), '更新后的识图助手')
  await submitEditor()
  expect(request).toHaveBeenCalledWith(
    'ai-endpoints/prompt-alternate',
    'PUT',
    expect.objectContaining({
      name: '更新后的识图助手',
      updatedAt: refreshedAt,
      isDefault: true,
    }),
  )
})

it('retains the editing draft and exposes the server error when saving fails', async () => {
  await act(async () => root.render(<Page />))
  await act(async () => button('编辑', service()).click())
  await change(inputFor('名称'), '尚未保存的渠道名')
  await change(inputFor('API 地址（Base URL）'), 'https://changed.fixture.example/v1')
  request.mockRejectedValueOnce(new Error('配置已被其他管理员更新，请重试'))
  await submitEditor()
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('配置已被其他管理员更新')
  expect(inputFor('名称').value).toBe('尚未保存的渠道名')
  expect(inputFor('API 地址（Base URL）').value).toBe('https://changed.fixture.example/v1')
  expect(button('保存渠道', dialog).disabled).toBe(false)
  await submitEditor()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('keeps a read-only catalog free of edit, test, credential and reverse configuration controls', async () => {
  request.mockResolvedValueOnce({
    endpoints: [{ ...endpoint, apiKey: 'fixture-private-key' }, promptEndpoint],
    canManage: false,
  })
  await act(async () => root.render(<Page />))
  expect(service()).toBeDefined()
  expect(container.textContent).not.toContain('fixture-private-key')
  expect(container.textContent).not.toContain(endpoint.baseUrl)
  expect(button('添加生图渠道')).toBeUndefined()
  expect(service().querySelector('button')).toBeNull()
  expect(service().querySelector('details')).toBeNull()
  expect(button('图片反推')).toBeUndefined()
  await tab('提示词与识图')
  expect(service(promptEndpoint.name)).toBeDefined()
  expect(service(promptEndpoint.name).querySelector('button')).toBeNull()
  expect(request.mock.calls.some(([path]) => path === 'prompt-templates')).toBe(false)
})

it.each([
  ['prompt', '提示词与识图'],
  ['reverse', '图片反推'],
] as const)(
  'opens the %s deep link directly and keeps its selection in the URL',
  async (view, label) => {
    window.history.replaceState(null, '', `/admin/settings?tab=${view}`)
    request.mockResolvedValueOnce({ endpoints: [endpoint, promptEndpoint], canManage: true })
    await act(async () => root.render(<Page />))
    expect(button(label).getAttribute('aria-selected')).toBe('true')
    if (view === 'reverse')
      expect(container.querySelector('[aria-label="反推草稿"]')).not.toBeNull()
    else expect(service(promptEndpoint.name)).toBeDefined()
    await tab('生图渠道')
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('image')
  },
)
