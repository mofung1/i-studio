// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminModelEditor } from './model-editor'
import { adminRequest, defaultModelCapabilities, type AdminModel } from '@/lib/admin'
import type { AIEndpoint } from '@/lib/ai-settings'

vi.mock('@/lib/admin', async (original) => ({
  ...(await original<object>()),
  adminRequest: vi.fn(),
}))
vi.mock('@/components/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      aria-label="添加渠道"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">选择渠道</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

let root: Root
let container: HTMLDivElement
let saved: AdminModel | undefined
const endpoints = ['official', 'relay'].map((id) => ({
  id,
  name: id,
  purpose: 'image',
  protocol: 'openai_images',
  enabled: true,
})) as AIEndpoint[]
const model: AdminModel = {
  id: 'public',
  name: '公开模型',
  version: 1,
  priceMinor: 125,
  enabled: true,
  isDefault: true,
  capabilities: defaultModelCapabilities,
  channels: [
    { endpointId: 'official', upstreamModelId: 'official-model', enabled: true, isActive: true },
  ],
}
function Editor() {
  const [editing, setEditing] = useState(model)
  return (
    <AdminModelEditor
      editing={editing}
      endpoints={endpoints}
      unit="积分"
      price="1.25"
      busy={false}
      onChange={setEditing}
      onPriceChange={() => {}}
      onClose={() => {}}
      onSubmit={(event) => {
        event.preventDefault()
        saved = editing
      }}
    />
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  saved = undefined
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
function buttons(text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
    button.textContent?.includes(text),
  )
}
async function save() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
it('adds a second binding, switches the primary and keeps the public price', async () => {
  await act(async () => root.render(<Editor />))
  await act(async () => {
    const select = container.querySelector('select')!
    select.value = 'relay'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const fields = container.querySelectorAll<HTMLInputElement>('input[maxlength="200"]')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      fields[1],
      'relay-model',
    )
    fields[1]!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click(),
  )
  await save()
  expect(saved?.channels).toEqual([
    { endpointId: 'official', upstreamModelId: 'official-model', enabled: true, isActive: false },
    { endpointId: 'relay', upstreamModelId: 'relay-model', enabled: true, isActive: true },
  ])
  expect(saved?.priceMinor).toBe(125)
  expect(container.textContent).toContain('仅影响新任务')
})
it('clears an active binding when disabled and can remove it explicitly', async () => {
  await act(async () => root.render(<Editor />))
  const label = Array.from(container.querySelectorAll('label')).find(
    (label) => label.textContent === '启用绑定',
  )!
  await act(async () => label.querySelector('input')!.click())
  await save()
  expect(saved).toBeUndefined()
  expect(container.textContent).toContain('上架前请选择已启用的主渠道')
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  )
  await save()
  expect(saved?.channels[0]).toMatchObject({ enabled: false, isActive: false })
  await act(async () => buttons('删除绑定')[0]!.click())
  await save()
  expect(saved?.channels).toEqual([])
})
it('requires explicit cost confirmation and tests the selected upstream model only', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(adminRequest).mockResolvedValue({ success: true, message: '生图成功' })
  await act(async () => root.render(<Editor />))
  await act(async () => buttons('真实生图测试')[0]!.click())
  expect(adminRequest).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  await act(async () => buttons('真实生图测试')[0]!.click())
  expect(adminRequest).toHaveBeenCalledWith('ai-endpoints/official/test', 'POST', {
    mode: 'generate',
    confirmCost: true,
    upstreamModelId: 'official-model',
  })
  expect(container.textContent).toContain('生图成功')
})

it('keeps an upstream failure on its own binding and locks saving during a test', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  let finish!: (value: { success: boolean; message: string }) => void
  vi.mocked(adminRequest).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  await act(async () => root.render(<Editor />))
  await act(async () => buttons('真实生图测试')[0]!.click())
  expect(buttons('保存模型')[0]!.disabled).toBe(true)
  expect(container.textContent).toContain('正在生成测试图')
  await act(async () => finish({ success: false, message: 'Mock API Key 无效' }))
  expect(container.querySelector('.model-channel-card [role="alert"]')?.textContent).toContain(
    'Mock API Key 无效',
  )
  expect(buttons('保存模型')[0]!.disabled).toBe(false)
})
