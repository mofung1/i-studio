// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PersonalPromptEditor } from './personal-prompt-editor'
import type { PersonalPrompt } from '@/lib/personal-prompts'

const mocks = vi.hoisted(() => ({
  owner: 'alice',
  request: vi.fn(),
  ask: vi.fn(),
}))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: { authenticated: true, user: { id: mocks.owner } },
    loading: false,
  }),
}))
vi.mock('@/lib/library', () => ({ libraryRequest: mocks.request }))
vi.mock('./use-action-confirmation', () => ({
  useActionConfirmation: () => ({ ask: mocks.ask, confirmation: null }),
}))
vi.mock('./library-controls', () => ({
  LibraryDialog: ({
    children,
    footer,
    onClose,
  }: {
    children: ReactNode
    footer?: ReactNode
    onClose: () => void
  }) => (
    <div>
      <button aria-label="关闭编辑器" onClick={onClose}>
        关闭
      </button>
      {children}
      {footer}
    </div>
  ),
  LibrarySelect: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    options: [string, string][]
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([id, title]) => (
        <option key={id} value={id}>
          {title}
        </option>
      ))}
    </select>
  ),
}))

let root: Root
let container: HTMLDivElement
const onClose = vi.fn()
const onSaved = vi.fn()
const seed = { title: '商品模板', prompt: '原始内容' }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  mocks.owner = 'alice'
  mocks.request.mockReset().mockResolvedValue({ categories: [] })
  mocks.ask.mockReset().mockResolvedValue(false)
  onClose.mockReset()
  onSaved.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})
async function render(nextSeed = seed, item?: PersonalPrompt) {
  await act(async () =>
    root.render(
      <PersonalPromptEditor seed={nextSeed} item={item} onClose={onClose} onSaved={onSaved} />,
    ),
  )
}
async function change(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(text: string) {
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === text)!
      .click(),
  )
}
async function reopen() {
  await act(async () => root.render(null))
  await render()
}
function value(label: string) {
  return container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!.value
}
function draftKeys() {
  return Object.keys(localStorage).filter((key) => key.startsWith('istudio-prompt-draft:'))
}

it('restores unsaved text and tags after closing and reopening the editor', async () => {
  await render()
  await change('提示词名称', '我的商品')
  await change('私有提示词内容', '修改后的内容 {{商品名称}}')
  await change('提示词标签', '商品、白底')
  expect(container.textContent).toContain('草稿已保存在此浏览器')
  await click('关闭并保留草稿')
  expect(onClose).toHaveBeenCalledOnce()
  await reopen()
  expect(value('提示词名称')).toBe('我的商品')
  expect(value('私有提示词内容')).toBe('修改后的内容 {{商品名称}}')
  expect(value('提示词标签')).toBe('商品、白底')
  expect(container.textContent).toContain('已恢复本地草稿')
})

it('isolates drafts between accounts and different source templates', async () => {
  await render()
  await change('私有提示词内容', 'Alice 私有草稿')
  mocks.owner = 'bob'
  await render()
  expect(value('私有提示词内容')).toBe(seed.prompt)
  mocks.owner = 'alice'
  await render({ title: '另一个模板', prompt: '另一份内容' })
  expect(value('私有提示词内容')).toBe('另一份内容')
  await reopen()
  expect(value('私有提示词内容')).toBe('Alice 私有草稿')
})

it('keeps edits when background updates change the seed while the dialog is open', async () => {
  await render()
  await change('提示词名称', '正在编辑的名称')
  await render({ ...seed, prompt: '后台更新的内容' })
  expect(value('提示词名称')).toBe('正在编辑的名称')
  expect(value('私有提示词内容')).toBe(seed.prompt)
})

it('does not restore a stale draft over a newer saved version', async () => {
  const item: PersonalPrompt = {
    id: 'p1',
    kind: 'prompt',
    title: '原稿',
    category: '',
    prompt: 'v1',
    tags: [],
    favorite: false,
    config: {},
    source: '',
    version: 1,
    createdAt: '',
    updatedAt: '',
  }
  await render(seed, item)
  await change('私有提示词内容', '旧版本草稿')
  await render(seed, { ...item, prompt: 'v2 新内容', version: 2 })
  expect(value('私有提示词内容')).toBe('v2 新内容')
})

it('clears the local draft only after a successful server save', async () => {
  await render()
  await change('私有提示词内容', '待提交')
  mocks.request.mockRejectedValueOnce(new Error('暂时离线'))
  await click('保存到我的提示词')
  expect(onSaved).not.toHaveBeenCalled()
  expect(draftKeys()).toHaveLength(1)
  const saved = { id: 'saved', prompt: '待提交' }
  mocks.request.mockResolvedValueOnce({ item: saved })
  await click('保存到我的提示词')
  expect(onSaved).toHaveBeenCalledWith(saved)
  expect(draftKeys()).toHaveLength(0)
})

it('protects edits when browser storage fails instead of claiming they were saved', async () => {
  await render()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded')
  })
  await change('私有提示词内容', '不能丢失')
  expect(container.textContent).toContain('草稿未保存')
  expect(container.textContent).not.toContain('草稿已保存在此浏览器')
  await click('关闭并保留草稿')
  expect(mocks.ask).toHaveBeenCalledOnce()
  expect(onClose).not.toHaveBeenCalled()
  expect(value('私有提示词内容')).toBe('不能丢失')
})

it('removes an abandoned draft and does not resurrect edits reverted to their original values', async () => {
  await render()
  await change('私有提示词内容', '临时内容')
  await change('私有提示词内容', seed.prompt)
  await reopen()
  expect(value('私有提示词内容')).toBe(seed.prompt)
  expect(draftKeys()).toHaveLength(0)
  await change('私有提示词内容', '丢弃的内容')
  mocks.ask.mockResolvedValueOnce(true)
  await click('放弃草稿')
  expect(draftKeys()).toHaveLength(0)
  await reopen()
  expect(value('私有提示词内容')).toBe(seed.prompt)
})
