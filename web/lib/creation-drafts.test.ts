// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  creationDraftContext,
  creationDraftKey,
  deleteCreationDraft,
  isCreationImage,
  prepareGuestDraftLogin,
  readCreationDraft,
  registerGuestDraft,
  writeCreationDraft,
} from './creation-drafts'
import type { CreationImage } from './creation-images'

/** A small asynchronous IndexedDB test driver; operations finish only on transaction commit. */
function memoryDatabase() {
  const values = new Map<string, unknown>()
  let putDelay = 0
  let rejectWrite = false
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      let pending = 0
      let stopped = false
      let complete: ReturnType<typeof setTimeout>
      const transaction = {
        error: null as DOMException | null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        abort() {
          stopped = true
          clearTimeout(complete)
          transaction.onabort?.()
        },
        objectStore() {
          return store
        },
      }
      function schedule(action: () => unknown, delay = 0) {
        pending++
        clearTimeout(complete)
        const request = { result: undefined as unknown, onsuccess: null as (() => void) | null }
        setTimeout(() => {
          if (stopped) return
          try {
            request.result = action()
            request.onsuccess?.()
          } catch (error) {
            transaction.error = error as DOMException
            transaction.abort()
            return
          }
          pending--
          if (!pending) complete = setTimeout(() => transaction.oncomplete?.(), 0)
        }, delay)
        return request
      }
      const store = {
        get(key: string) {
          return schedule(() => values.get(key))
        },
        put(value: unknown, key: string) {
          const delay = putDelay
          putDelay = 0
          return schedule(() => {
            if (rejectWrite) {
              rejectWrite = false
              throw new DOMException('full', 'QuotaExceededError')
            }
            values.set(key, value)
          }, delay)
        },
        delete(key: string) {
          return schedule(() => {
            values.delete(key)
          })
        },
      }
      return transaction
    },
  }
  vi.stubGlobal('indexedDB', {
    open() {
      const request = { result: database, onsuccess: null as (() => void) | null }
      setTimeout(() => request.onsuccess?.(), 0)
      return request
    },
  })
  return {
    values,
    delayNextWrite: (delay: number) => {
      putDelay = delay
    },
    failNextWrite: () => {
      rejectWrite = true
    },
  }
}

const schema = z.object({
  text: z.string(),
  images: z.array(z.custom<CreationImage>(isCreationImage)),
})
const parse = (value: unknown) => schema.parse(value)
const value = (text: string) => ({ text, images: [] as CreationImage[] })
let database: ReturnType<typeof memoryDatabase>
let unregister: (() => void) | undefined
beforeEach(() => {
  sessionStorage.clear()
  database = memoryDatabase()
})
afterEach(() => {
  unregister?.()
  unregister = undefined
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('round-trips uploaded bytes, File metadata, and protected asset references', async () => {
  const file = new File(['real product image bytes'], '商品.png', {
    type: 'image/png',
    lastModified: 12345,
  })
  const asset = {
    kind: 'asset' as const,
    assetId: 'asset-1',
    name: '已存图片',
    type: 'image/jpeg',
    size: 10,
    width: 100,
    height: 200,
    contentPath: '/v1/assets/asset-1/content',
    thumbnailPath: '/v1/assets/asset-1/thumbnail',
  }
  await writeCreationDraft('alice', 'general', { text: '商品主图', images: [file, asset] })
  const restored = await readCreationDraft('alice', 'general', parse)
  const image = restored!.value.images[0] as File
  expect(image).toBeInstanceOf(File)
  expect([image.name, image.type, image.lastModified]).toEqual(['商品.png', 'image/png', 12345])
  const bytes = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(image)
  })
  expect(bytes).toBe('real product image bytes')
  expect(restored!.value.images[1]).toEqual(asset)
})

it('keeps account, tool, and project drafts independent', async () => {
  const first = creationDraftContext('general', 'product-1')
  const second = creationDraftContext('general', 'product-2')
  await writeCreationDraft('alice', first, value('项目一'))
  await writeCreationDraft('alice', second, value('项目二'))
  await writeCreationDraft('bob', first, value('Bob'))
  expect((await readCreationDraft('alice', first, parse))?.value.text).toBe('项目一')
  expect((await readCreationDraft('alice', second, parse))?.value.text).toBe('项目二')
  expect((await readCreationDraft('bob', first, parse))?.value.text).toBe('Bob')
  expect(
    await readCreationDraft(
      'alice',
      creationDraftContext('commerce:detail-page', 'product-1'),
      parse,
    ),
  ).toBeNull()
})

it('flushes and transfers only the explicitly selected guest draft once on login', async () => {
  const context = creationDraftContext('general', 'project-1')
  const other = creationDraftContext('commerce:detail-page', 'project-1')
  await writeCreationDraft('guest', other, value('其他工具'))
  unregister = registerGuestDraft(context, () =>
    writeCreationDraft('guest', context, value('游客最后编辑')),
  )
  await prepareGuestDraftLogin('/studio?mode=general&projectId=project-1')
  expect((await readCreationDraft('alice', context, parse))?.value.text).toBe('游客最后编辑')
  expect(await readCreationDraft('guest', context, parse)).toBeNull()
  expect(await readCreationDraft('bob', context, parse)).toBeNull()
  expect((await readCreationDraft('guest', other, parse))?.value.text).toBe('其他工具')
})

it('never transfers a guest draft without an explicit login action', async () => {
  await writeCreationDraft('guest', 'general', value('游客内容'))
  expect(await readCreationDraft('alice', 'general', parse)).toBeNull()
})

it('validates a guest draft before replacing an existing account draft', async () => {
  const context = creationDraftContext('general')
  await writeCreationDraft('alice', context, value('账号原有内容'))
  unregister = registerGuestDraft(context, async () => {})
  await prepareGuestDraftLogin('/studio')
  database.values.set(creationDraftKey('guest', context), {
    version: 1,
    source: '{}',
    savedAt: Date.now(),
    value: { text: 42 },
  })
  expect((await readCreationDraft('alice', context, parse))?.value.text).toBe('账号原有内容')
  expect(database.values.has(creationDraftKey('guest', context))).toBe(true)
})

it('serializes writes across editors and waits before restoring after remount', async () => {
  database.delayNextWrite(30)
  const first = writeCreationDraft('alice', 'general', value('较早的输入'))
  const second = writeCreationDraft('alice', 'general', value('卸载前最后输入'))
  const restored = readCreationDraft('alice', 'general', parse)
  await Promise.all([first, second])
  expect((await restored)?.value.text).toBe('卸载前最后输入')
})

it('deletes after pending writes and leaves other tools intact', async () => {
  database.delayNextWrite(20)
  const pending = writeCreationDraft('alice', 'general', value('旧内容'))
  const clearing = deleteCreationDraft('alice', 'general')
  await writeCreationDraft('alice', 'commerce', value('保留'))
  await Promise.all([pending, clearing])
  expect(await readCreationDraft('alice', 'general', parse)).toBeNull()
  expect((await readCreationDraft('alice', 'commerce', parse))?.value.text).toBe('保留')
})

it('waits for a later flush queued while a restore is already waiting', async () => {
  database.delayNextWrite(30)
  const first = writeCreationDraft('alice', 'general', value('自动保存中'))
  const restoring = readCreationDraft('alice', 'general', parse)
  const last = writeCreationDraft('alice', 'general', value('离开页面时刷新保存'))
  await Promise.all([first, last])
  expect((await restoring)?.value.text).toBe('离开页面时刷新保存')
})

it('reports quota failures and allows a later retry without poisoning the queue', async () => {
  database.failNextWrite()
  await expect(writeCreationDraft('alice', 'general', value('草稿'))).rejects.toMatchObject({
    name: 'QuotaExceededError',
  })
  await writeCreationDraft('alice', 'general', value('重试后的草稿'))
  expect((await readCreationDraft('alice', 'general', parse))?.value.text).toBe('重试后的草稿')
})

it('rejects unsupported record versions and unavailable browser storage', async () => {
  database.values.set(creationDraftKey('alice', 'general'), { version: 99 })
  await expect(readCreationDraft('alice', 'general', parse)).rejects.toThrow('版本')
  vi.stubGlobal('indexedDB', undefined)
  await expect(writeCreationDraft('alice', 'general', value('草稿'))).rejects.toThrow('不支持')
})
