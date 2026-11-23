// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AiEndpointEditor, type EndpointEditing } from './ai-endpoint-editor'
import type { EndpointInput } from '@/lib/ai-settings'

const imageInput: EndpointInput = {
  name: '演示生图渠道',
  purpose: 'image',
  protocol: 'openai_images',
  baseUrl: 'https://fixture.example/v1',
  model: '',
  apiKey: 'fixture-key',
  timeoutSeconds: 300,
  capabilities: {},
  enabled: true,
  isDefault: false,
}
let root: Root
let host: HTMLDivElement
let submitted: EndpointInput | undefined
const onClose = vi.fn()

function Editor({
  initial = { input: imageInput },
  busy = false,
  error = '',
}: {
  initial?: EndpointEditing
  busy?: boolean
  error?: string
}) {
  const [editing, setEditing] = useState(initial)
  const returnFocus = useRef<HTMLElement | null>(null)
  return (
    <AiEndpointEditor
      editing={editing}
      busy={busy}
      error={error}
      onChange={(patch) =>
        setEditing((previous) => ({ ...previous, input: { ...previous.input, ...patch } }))
      }
      onClose={onClose}
      returnFocus={returnFocus}
      onSubmit={(event) => {
        event.preventDefault()
        submitted = editing.input
      }}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  onClose.mockClear()
  submitted = undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function input(label: string) {
  const element = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (item) => item.textContent === label,
  )!
  return document.getElementById(element.htmlFor) as HTMLInputElement
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  )!
}
function checkbox(label: string) {
  return [...document.querySelectorAll<HTMLLabelElement>('label')]
    .find((item) => item.querySelector('strong')?.textContent === label)!
    .querySelector<HTMLInputElement>('input')!
}
async function change(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}

it('saves an image channel without a test model and keeps advanced settings collapsed', async () => {
  await act(async () => root.render(<Editor />))
  expect(document.querySelector('details')?.open).toBe(false)
  expect(input('测试模型 ID（可选）').required).toBe(false)
  expect(document.querySelector('form')!.checkValidity()).toBe(true)
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    '仅保存渠道不会自动上架模型',
  )
  await submit()
  expect(submitted).toMatchObject({ purpose: 'image', model: '', timeoutSeconds: 300 })
})

it('clears the old key and test model when selecting a different provider preset', async () => {
  await act(async () => root.render(<Editor />))
  await change(input('测试模型 ID（可选）'), 'fixture-model')
  await act(async () => button('Gemini 官方').click())
  expect(input('名称').value).toBe('Gemini 官方')
  expect(input('API 地址（Base URL）').value).toBe(
    'https://generativelanguage.googleapis.com/v1beta',
  )
  expect(input('API Key').value).toBe('')
  expect(input('测试模型 ID（可选）').value).toBe('')
  expect(input('请求超时（秒）').value).toBe('300')
  await change(input('API Key'), 'another-fixture-key')
  await submit()
  expect(submitted).toMatchObject({
    protocol: 'gemini_native',
    model: '',
    apiKey: 'another-fixture-key',
  })
})

it('requires a prompt model and clears default selection when the service is disabled', async () => {
  await act(async () =>
    root.render(
      <Editor
        initial={{
          input: { ...imageInput, purpose: 'prompt', protocol: 'openai_chat', isDefault: true },
        }}
      />,
    ),
  )
  expect(input('上游模型 ID').required).toBe(true)
  expect(document.querySelector('form')!.checkValidity()).toBe(false)
  await change(input('上游模型 ID'), 'fixture-vision')
  expect(document.querySelector('form')!.checkValidity()).toBe(true)
  await act(async () => checkbox('支持图片识别').click())
  await act(async () => checkbox('启用服务').click())
  expect(checkbox('设为默认提示词服务').checked).toBe(false)
  expect(checkbox('设为默认提示词服务').disabled).toBe(true)
  await submit()
  expect(submitted).toMatchObject({
    model: 'fixture-vision',
    enabled: false,
    isDefault: false,
    capabilities: { vision: true },
  })
})

it('preserves the existing key on edit and allows an empty key for the retain-existing behavior', async () => {
  await act(async () =>
    root.render(
      <Editor
        initial={{ id: 'existing', input: { ...imageInput, updatedAt: '2026-11-16T00:00:00Z' } }}
      />,
    ),
  )
  expect(input('API Key').value).toBe('fixture-key')
  expect(input('API Key').required).toBe(false)
  expect(button('OpenAI 官方')).toBeUndefined()
  await change(input('API Key'), '')
  await submit()
  expect(submitted).toMatchObject({ apiKey: '', updatedAt: '2026-11-16T00:00:00Z' })
})

it('opens advanced settings when a hidden timeout is invalid', async () => {
  await act(async () =>
    root.render(<Editor initial={{ input: { ...imageInput, timeoutSeconds: 0 } }} />),
  )
  expect(document.querySelector('details')?.open).toBe(false)
  await act(async () => {
    input('请求超时（秒）').checkValidity()
  })
  expect(document.querySelector('details')?.open).toBe(true)
})

it('locks edits, closing and duplicate submits while saving and retains server errors', async () => {
  await act(async () => root.render(<Editor busy error="保存失败，请重试" />))
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('保存失败，请重试')
  expect(input('名称').matches(':disabled')).toBe(true)
  expect(checkbox('启用渠道').matches(':disabled')).toBe(true)
  expect(button('取消').disabled).toBe(true)
  expect(button('保存中…').disabled).toBe(true)
  await submit()
  expect(submitted).toBeUndefined()
  expect(onClose).not.toHaveBeenCalled()
})
