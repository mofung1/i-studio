// @vitest-environment jsdom
import { act, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  creationDraftContext,
  creationDraftKey,
  type CreationDraftRecord,
} from '@/lib/creation-drafts'
import { PromptEditor } from './prompt-editor'
import { useCreationDraft } from './use-creation-draft'

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/creation-drafts', async (original) => ({
  ...(await original<typeof import('@/lib/creation-drafts')>()),
  readCreationDraft: storage.read,
  writeCreationDraft: storage.write,
  deleteCreationDraft: storage.remove,
}))

type Value = { prompt: string }
const context = creationDraftContext('general', 'project-a')
let records: Map<string, CreationDraftRecord<Value>>
let root: Root
let container: HTMLDivElement

function DraftEditor({ owner }: { owner: string }) {
  const defaults = useMemo(() => ({ prompt: '' }), [])
  const [value, setValue] = useState(defaults)
  const draft = useCreationDraft({
    owner,
    context,
    enabled: true,
    value,
    defaultValue: defaults,
    parse: (value) => value as Value,
    onRestore: setValue,
  })
  if (!draft.ready) return <p>恢复草稿中</p>
  return (
    <>
      <output data-status>{draft.status}</output>
      <PromptEditor
        value={value.prompt}
        onChange={(prompt) => setValue({ prompt })}
        ariaLabel="画面描述"
        placeholder="输入提示词"
        compact
        draftStatus={draft.status}
        draftError={draft.error}
        onRetryDraft={draft.retry}
      />
    </>
  )
}

async function render(owner = 'alice') {
  await act(async () => root.render(<DraftEditor key={owner} owner={owner} />))
}

async function openEditor() {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="大窗编辑"]')!.click(),
  )
}

function largeInput() {
  return document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')!
}

async function edit(value: string) {
  await act(async () => {
    const input = largeInput()
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function saveDebounce() {
  await act(async () => vi.advanceTimersByTimeAsync(350))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  records = new Map()
  storage.read
    .mockReset()
    .mockImplementation(
      async (owner: string, context: string) =>
        records.get(creationDraftKey(owner, context)) ?? null,
    )
  storage.write
    .mockReset()
    .mockImplementation(
      async (
        owner: string,
        context: string,
        value: Value,
        source: string,
        entryApplied: boolean,
      ) => {
        records.set(creationDraftKey(owner, context), {
          version: 1,
          savedAt: Date.now(),
          value,
          source,
          entryApplied,
        })
      },
    )
  storage.remove.mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('autosaves large-editor changes before the dialog closes and restores them after remount', async () => {
  const text = '主体：完整商品外观\n光线：自然光与柔和阴影\n' + '保留真实细节。'.repeat(150)
  await render()
  await openEditor()
  await edit(text)
  await saveDebounce()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(container.querySelector('[data-status]')?.textContent).toBe('saved')
  expect(records.get(creationDraftKey('alice', context))?.value.prompt).toBe(text)
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  expect(container.querySelector('textarea')?.value).toBe(text)
  await openEditor()
  expect(largeInput().value).toBe(text)
})

it('flushes the latest large-editor change on account switch without leaking it to another owner', async () => {
  await render()
  await openEditor()
  await edit('Alice 尚未到自动保存时间的长提示词')
  await render('bob')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(container.querySelector('textarea')?.value).toBe('')
  await openEditor()
  await edit('Bob 独立的提示词')
  await saveDebounce()
  await render('alice')
  expect(container.querySelector('textarea')?.value).toBe('Alice 尚未到自动保存时间的长提示词')
  await openEditor()
  expect(largeInput().value).toBe('Alice 尚未到自动保存时间的长提示词')
  expect(records.get(creationDraftKey('bob', context))?.value.prompt).toBe('Bob 独立的提示词')
})

it('shows a failed draft save inside the large editor and retries without losing the current text', async () => {
  await render()
  await openEditor()
  storage.write.mockRejectedValueOnce(new DOMException('disk full', 'QuotaExceededError'))
  await edit('需要保留的长提示词：主体、构图、真实材质与品牌文字。')
  await saveDebounce()
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(dialog.querySelector('[role="status"]')?.textContent).toContain('空间不足')
  expect(dialog.querySelector('[role="status"]')?.textContent).not.toContain('已保存')
  expect(largeInput().value).toBe('需要保留的长提示词：主体、构图、真实材质与品牌文字。')
  expect(container.querySelector('textarea')?.value).toBe(largeInput().value)
  await act(async () =>
    [...dialog.querySelectorAll('button')]
      .find((button) => button.textContent === '重试保存')!
      .click(),
  )
  expect(dialog.querySelector('[role="status"]')?.textContent).toBe('草稿已保存到本机')
  expect(records.get(creationDraftKey('alice', context))?.value.prompt).toBe(largeInput().value)
})
