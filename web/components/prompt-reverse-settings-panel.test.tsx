// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AIEndpoint, PromptTemplate } from '@/lib/ai-settings'
import type { ReverseConfiguration } from '@/lib/prompt-reverse'
import { PromptReverseSettingsPanel } from './prompt-reverse-settings-panel'

let root: Root
let container: HTMLDivElement
const fetcher = vi.fn<typeof fetch>()
const callbacks = {
  onDirtyChange: vi.fn(),
  onSavingChange: vi.fn(),
  onOpenServices: vi.fn(),
  onOpenTemplates: vi.fn(),
}
const endpoint = (patch: Partial<AIEndpoint> = {}): AIEndpoint => ({
  id: 'vision',
  name: '识图服务',
  purpose: 'prompt',
  protocol: 'openai_chat',
  baseUrl: 'https://example.test/v1',
  model: 'vision-model',
  timeoutSeconds: 60,
  capabilities: { vision: true },
  enabled: true,
  isDefault: false,
  apiKeyConfigured: true,
  apiKeyMasked: '***',
  ...patch,
})
const configuration = (patch: Partial<ReverseConfiguration> = {}): ReverseConfiguration => ({
  settings: { endpointId: 'vision', timeoutSeconds: 240, imageDetail: 'high', retentionHours: 72 },
  available: true,
  reason: '',
  serviceName: '识图服务',
  model: 'vision-model',
  ...patch,
})
const templates: PromptTemplate[] = ['scene', 'style'].map((mode) => ({
  key: `reverse.${mode}`,
  name: mode,
  category: 'reverse',
  content: 'template',
  defaultContent: 'template',
  enabled: mode === 'scene',
  sortOrder: 0,
}))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', fetcher)
  localStorage.setItem('istudio-access-token', 'customer-session')
  localStorage.setItem('istudio-admin-token', 'operator-session')
  fetcher.mockReset()
  Object.values(callbacks).forEach((callback) => callback.mockReset())
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status })
}
async function render(endpoints = [endpoint()]) {
  await act(async () =>
    root.render(
      <PromptReverseSettingsPanel endpoints={endpoints} templates={templates} {...callbacks} />,
    ),
  )
}
function button(text: string) {
  const match = [...container.querySelectorAll('button')].find((item) => item.textContent === text)
  if (!match) throw new Error(`未找到按钮：${text}`)
  return match
}
async function changeTimeout(value: string) {
  const input = container.querySelector<HTMLInputElement>('#reverse-timeout')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function save() {
  await act(async () => button('保存配置').click())
}

it('reads and saves reverse configuration using the isolated administrator session', async () => {
  localStorage.removeItem('istudio-access-token')
  fetcher.mockImplementation(async (_url, init) =>
    response(
      init?.method === 'PUT'
        ? configuration({ settings: JSON.parse(String(init.body)) })
        : configuration(),
    ),
  )
  await render()
  expect(container.textContent).toContain('当前使用')
  await changeTimeout('180')
  await save()
  expect(fetcher).toHaveBeenCalledTimes(2)
  for (const [url, init] of fetcher.mock.calls) {
    expect(new URL(String(url)).pathname).toBe('/v1/admin/prompt-reverse-settings')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer operator-session')
  }
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({
    endpointId: 'vision',
    timeoutSeconds: 180,
  })
  expect(container.textContent).toContain('图片反推配置已保存')
  expect(button('保存配置').disabled).toBe(true)
})

it('does not substitute an unrelated vision service when the default is text only', async () => {
  fetcher.mockResolvedValue(
    response(
      configuration({
        settings: { ...configuration().settings, endpointId: '' },
        available: false,
        reason: '默认 Prompt 服务不支持图片识别',
      }),
    ),
  )
  await render([
    endpoint(),
    endpoint({ id: 'text', name: '文本服务', isDefault: true, capabilities: {} }),
  ])
  expect(container.querySelector('.reverse-service-summary')).toBeNull()
  expect(container.querySelector('.reverse-service-unavailable')?.textContent).toContain(
    '默认 Prompt 服务不支持图片识别',
  )
  expect(container.textContent).toContain('服务待配置')
  expect(container.textContent).toContain('默认 Prompt 服务也必须支持识图')
})

it('keeps the dedicated vision service when restoring recommended analysis parameters', async () => {
  fetcher.mockImplementation(async (_url, init) =>
    response(
      init?.method === 'PUT'
        ? configuration({ settings: JSON.parse(String(init.body)) })
        : configuration(),
    ),
  )
  await render()
  await act(async () => button('恢复推荐参数').click())
  expect(container.querySelector<HTMLInputElement>('#reverse-timeout')?.value).toBe('120')
  expect(container.querySelector<HTMLInputElement>('#reverse-retention')?.value).toBe('24')
  expect(container.querySelector('.reverse-service-summary')?.textContent).toContain('识图服务')
  await save()
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({
    endpointId: 'vision',
    timeoutSeconds: 120,
    retentionHours: 24,
    imageDetail: 'auto',
  })
})

it('shows each mode status and opens its own template editor', async () => {
  fetcher.mockResolvedValue(response(configuration()))
  await render()
  const scene = container.querySelector<HTMLButtonElement>('[aria-label="编辑还原画面提示词"]')!
  const style = container.querySelector<HTMLButtonElement>('[aria-label="编辑只提取风格提示词"]')!
  expect(scene.textContent).toContain('已启用')
  expect(style.textContent).toContain('已停用')
  await act(async () => style.click())
  expect(callbacks.onOpenTemplates).toHaveBeenCalledWith('reverse.style')
})

it('allows retry after a load error and preserves edited values when saving fails', async () => {
  fetcher
    .mockResolvedValueOnce(response({ message: '后台会话已失效' }, 401))
    .mockResolvedValueOnce(response(configuration()))
    .mockResolvedValueOnce(response({ message: '保存暂时失败' }, 500))
  await render()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('后台会话已失效')
  await act(async () => button('重新读取').click())
  await changeTimeout('300')
  await save()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('保存暂时失败')
  expect(container.querySelector<HTMLInputElement>('#reverse-timeout')?.value).toBe('300')
  expect(button('保存配置').disabled).toBe(false)
  expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(true)
})
