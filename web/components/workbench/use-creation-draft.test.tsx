// @vitest-environment jsdom
import { act, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCreationDraft } from './use-creation-draft'
import { creationDraftKey, type CreationDraftRecord } from '@/lib/creation-drafts'
import type { CreationImage } from '@/lib/creation-images'

const storage = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/creation-drafts', async (original) => ({
  ...(await original<typeof import('@/lib/creation-drafts')>()),
  readCreationDraft: storage.read,
  writeCreationDraft: storage.write,
  deleteCreationDraft: storage.remove,
}))
type Value = { text: string; images: CreationImage[] }
let records: Map<string, CreationDraftRecord<Value>>
let root: Root
let container: HTMLDivElement
let editor: {
  value: Value
  draft: ReturnType<typeof useCreationDraft<Value>>
  edit: (value: Value) => void
}
function Harness({
  owner = 'alice',
  context = 'general',
  source = '{}',
  enabled = true,
  initial = '',
}: {
  owner?: string
  context?: string
  source?: string
  enabled?: boolean
  initial?: string
}) {
  const defaults = useMemo<Value>(() => ({ text: initial, images: [] }), [initial])
  const empty = useMemo<Value>(() => ({ text: '', images: [] }), [])
  const [value, edit] = useState(defaults)
  const draft = useCreationDraft({
    owner,
    context,
    source,
    enabled,
    value,
    defaultValue: defaults,
    emptyValue: empty,
    parse: (value) => value as Value,
    onRestore: edit,
  })
  editor = { value, draft, edit }
  return (
    <output>
      {value.text}:{draft.status}
    </output>
  )
}
const record = (text: string, source = '{}', entryApplied = true): CreationDraftRecord<Value> => ({
  version: 1,
  savedAt: Date.now(),
  source,
  entryApplied,
  value: { text, images: [] },
})
async function render(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<Harness {...props} />))
}
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
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
  storage.remove.mockReset().mockImplementation(async (owner: string, context: string) => {
    records.delete(creationDraftKey(owner, context))
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  vi.useRealTimers()
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('waits for account readiness and restores local files and asset references together', async () => {
  const file = new File(['product bytes'], 'product.png', { type: 'image/png', lastModified: 123 })
  const asset = {
    kind: 'asset' as const,
    assetId: 'image-1',
    name: '成片',
    type: 'image/png',
    size: 2,
    width: 3,
    height: 4,
    contentPath: '/v1/assets/image-1/content',
    thumbnailPath: '/thumbnail',
  }
  records.set(creationDraftKey('alice', 'general'), {
    ...record('保留这个描述'),
    value: { text: '保留这个描述', images: [file, asset] },
  })
  await render({ enabled: false })
  expect(storage.read).not.toHaveBeenCalled()
  expect(editor.draft.ready).toBe(false)
  await render()
  expect(editor.value.text).toBe('保留这个描述')
  expect(editor.value.images).toEqual([file, asset])
  expect(editor.draft.ready).toBe(true)
})

it('flushes the latest edit on unmount before a debounce has elapsed', async () => {
  await render()
  await act(async () => editor.edit({ text: '刚输入的内容', images: [] }))
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  expect(editor.value.text).toBe('刚输入的内容')
})

it('keeps accounts and tools isolated while switching the same mounted editor', async () => {
  records.set(creationDraftKey('alice', 'commerce:detail'), record('详情草稿'))
  records.set(creationDraftKey('bob', 'commerce:detail'), record('Bob 的草稿'))
  await render()
  await act(async () => editor.edit({ text: 'Alice 通用草稿', images: [] }))
  await render({ context: 'commerce:detail' })
  expect(editor.value.text).toBe('详情草稿')
  await render({ owner: 'bob', context: 'commerce:detail' })
  expect(editor.value.text).toBe('Bob 的草稿')
  await render()
  expect(editor.value.text).toBe('Alice 通用草稿')
})

it('never overwrites edits with a slower asynchronous restore', async () => {
  let resolve!: (value: CreationDraftRecord<Value>) => void
  storage.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await render()
  await act(async () => editor.edit({ text: '用户已经输入', images: [] }))
  await act(async () => resolve(record('旧草稿')))
  expect(editor.value.text).toBe('用户已经输入')
})

it('does not save defaults over an unread draft and retries restoration', async () => {
  records.set(creationDraftKey('alice', 'general'), record('重要草稿'))
  storage.read.mockRejectedValueOnce(new Error('暂时无法读取'))
  await render()
  expect(editor.draft.status).toBe('error')
  expect(editor.draft.restorationFailed).toBe(true)
  await settle()
  expect(storage.write).not.toHaveBeenCalled()
  await act(async () => editor.draft.retry())
  expect(editor.value.text).toBe('重要草稿')
  expect(editor.draft.ready).toBe(true)
  expect(editor.draft.restorationFailed).toBe(false)
})

it('does not overwrite a failed read during unmount', async () => {
  storage.read.mockRejectedValueOnce(new Error('读取中断'))
  await render()
  await act(async () => root.unmount())
  root = createRoot(container)
  expect(storage.write).not.toHaveBeenCalled()
})

it('shows quota errors and preserves the edit until saving succeeds', async () => {
  await render()
  storage.write.mockRejectedValueOnce(new DOMException('disk full', 'QuotaExceededError'))
  await act(async () => editor.edit({ text: '尚未保存', images: [] }))
  await settle()
  expect(editor.draft.status).toBe('error')
  expect(editor.draft.error).toContain('空间不足')
  await act(async () => editor.draft.retry())
  expect(editor.draft.status).toBe('saved')
  expect(editor.value.text).toBe('尚未保存')
})

it('preserves edited URL prompts on refresh and clears them without reviving the original prompt', async () => {
  const source = JSON.stringify({ prompt: '最初提示词' })
  records.set(creationDraftKey('alice', 'general'), record('后来编辑的提示词', source))
  await render({ source, initial: '最初提示词' })
  expect(editor.value.text).toBe('后来编辑的提示词')
  await act(async () => editor.draft.clear())
  expect(editor.value.text).toBe('')
  await act(async () => root.unmount())
  root = createRoot(container)
  await render({ source, initial: '最初提示词' })
  expect(editor.value.text).toBe('')
  expect(editor.draft.restoredSource).toBe(source)
})

it('does not mistake an autosaved pending handoff for a successfully applied handoff', async () => {
  const source = JSON.stringify({ resumeTask: 'task-1' })
  await render({ source })
  await settle()
  expect(records.get(creationDraftKey('alice', 'general'))?.entryApplied).toBe(false)
  await act(async () => root.unmount())
  root = createRoot(container)
  await render({ source })
  expect(editor.draft.restoredSource).toBeNull()
  await act(async () => {
    editor.edit({ text: '历史配置成功载入', images: [] })
    editor.draft.markEntryApplied()
  })
  await settle()
  const stored = records.get(creationDraftKey('alice', 'general'))!
  expect(stored.entryApplied).toBe(true)
  expect(stored.value.text).toBe('历史配置成功载入')
})

it('saves explicit template snapshots before their URL is consumed without reloading the draft', async () => {
  const source = JSON.stringify({ inspirationId: 'template-1' })
  await render({ source })
  const next = { text: '带入的完整模板', images: [] }
  await act(async () => {
    editor.edit(next)
    await editor.draft.save(next)
  })
  await render({ source: '{}' })
  expect(storage.read).toHaveBeenCalledTimes(1)
  expect(editor.value.text).toBe('带入的完整模板')
  expect(records.get(creationDraftKey('alice', 'general'))?.entryApplied).toBe(true)
})

it('keeps an existing draft until a different asynchronous template is actually applied', async () => {
  records.set(creationDraftKey('alice', 'general'), record('原有未完成作品'))
  await render({ source: JSON.stringify({ inspirationId: 'new-template' }) })
  expect(editor.value.text).toBe('原有未完成作品')
  expect(editor.draft.restoredSource).toBeNull()
  await settle()
  expect(records.get(creationDraftKey('alice', 'general'))?.entryApplied).toBe(false)
})

it('rejects clear failures so callers do not consume the entry URL as a success', async () => {
  await render()
  storage.remove.mockRejectedValueOnce(new Error('delete failed'))
  await act(async () => {
    await expect(editor.draft.clear()).rejects.toThrow('delete failed')
  })
  expect(editor.draft.status).toBe('error')
})

it('ignores an old account restore after a different account becomes active', async () => {
  let resolve!: (value: CreationDraftRecord<Value>) => void
  storage.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  records.set(creationDraftKey('bob', 'general'), record('Bob'))
  await render()
  await render({ owner: 'bob' })
  await act(async () => resolve(record('Alice')))
  expect(editor.value.text).toBe('Bob')
})
