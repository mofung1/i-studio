import { isStoredImage, type CreationImage } from './creation-images'

const databaseName = 'istudio-creation-drafts'
const storeName = 'drafts'
const loginTransferKey = 'istudio-guest-draft-login'
const storageTimeout = 4000
const pendingWrites = new Map<string, Promise<void>>()
const fileIdentities = new WeakMap<File, number>()
let nextFileIdentity = 0

function queueWrite(key: string, action: () => Promise<void>) {
  const writing = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(action)
  pendingWrites.set(key, writing)
  void writing
    .finally(() => {
      if (pendingWrites.get(key) === writing) pendingWrites.delete(key)
    })
    .catch(() => {})
  return writing
}

async function waitForWrites(key: string) {
  let pending = pendingWrites.get(key)
  while (pending) {
    await pending.catch(() => {})
    const next = pendingWrites.get(key)
    if (next === pending) return
    pending = next
  }
}

export interface CreationDraftRecord<T> {
  version: 1
  source: string
  savedAt: number
  entryApplied?: boolean
  value: T
}

export function creationDraftContext(tool: string, projectId = '') {
  return JSON.stringify([tool, projectId])
}

export function creationDraftKey(owner: string, context: string) {
  return JSON.stringify([owner, context])
}

/** File metadata is explicit because some browsers restore IndexedDB Files as Blobs. */
function encode(value: unknown): unknown {
  if (typeof File !== 'undefined' && value instanceof File)
    return { __creationFile: true, blob: value, name: value.name, lastModified: value.lastModified }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
  return value
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    if (item.__creationFile === true) {
      if (!(item.blob instanceof Blob) || typeof item.name !== 'string')
        throw new Error('草稿中的图片无法恢复，请重新选择素材')
      return new File([item.blob], item.name, {
        type: item.blob.type,
        lastModified: typeof item.lastModified === 'number' ? item.lastModified : 0,
      })
    }
    return Object.fromEntries(Object.entries(item).map(([key, field]) => [key, decode(field)]))
  }
  return value
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('浏览器不支持本地草稿保存'))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error('本地草稿暂时无法读取，请关闭其他旧版页面后重试'))
    }, storageTimeout)
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(databaseName, 1)
    } catch (error) {
      clearTimeout(timer)
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName))
        request.result.createObjectStore(storeName)
    }
    request.onerror = () => {
      clearTimeout(timer)
      reject(request.error ?? new Error('无法打开本地草稿'))
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      if (settled) request.result.close()
      else resolve(request.result)
    }
  })
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, result: (value: T) => void) => void,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    let result: T
    const timer = setTimeout(() => transaction.abort(), storageTimeout)
    transaction.oncomplete = () => {
      clearTimeout(timer)
      database.close()
      resolve(result)
    }
    transaction.onabort = transaction.onerror = () => {
      clearTimeout(timer)
      database.close()
      reject(transaction.error ?? new Error('本地草稿保存中断'))
    }
    try {
      action(transaction.objectStore(storeName), (value) => {
        result = value
      })
    } catch (error) {
      clearTimeout(timer)
      transaction.abort()
      database.close()
      reject(error)
    }
  })
}

function pendingGuestTransfer(context: string) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(loginTransferKey) ?? 'null')
    return pending?.context === context && Date.now() - pending.createdAt < 30 * 60 * 1000
  } catch {
    return false
  }
}

export async function readCreationDraft<T>(
  owner: string,
  context: string,
  parse: (value: unknown) => T,
): Promise<CreationDraftRecord<T> | null> {
  function parsedRecord(raw: unknown): CreationDraftRecord<T> | null {
    if (raw == null) return null
    if (typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1)
      throw new Error('本地草稿版本无法读取，请清空草稿后重新开始')
    const record = raw as CreationDraftRecord<unknown>
    if (typeof record.source !== 'string' || typeof record.savedAt !== 'number')
      throw new Error('本地草稿内容损坏，请清空草稿后重新开始')
    return { ...record, value: parse(decode(record.value)) }
  }
  const key = creationDraftKey(owner, context)
  const transfer = owner !== 'guest' && pendingGuestTransfer(context)
  await waitForWrites(key)
  if (transfer) await waitForWrites(creationDraftKey('guest', context))
  const raw = await transact<unknown>('readwrite', (store, result) => {
    const own = () => {
      const request = store.get(key)
      request.onsuccess = () => result(request.result)
    }
    if (!transfer) {
      own()
      return
    }
    const guestKey = creationDraftKey('guest', context)
    const guest = store.get(guestKey)
    guest.onsuccess = () => {
      if (guest.result) {
        try {
          parsedRecord(guest.result)
        } catch {
          // A damaged guest draft must never replace this account's valid work.
          own()
          return
        }
        store.put(guest.result, key)
        store.delete(guestKey)
        result(guest.result)
      } else own()
    }
  })
  if (transfer) {
    try {
      sessionStorage.removeItem(loginTransferKey)
    } catch {
      /* Optional browser storage. */
    }
  }
  return parsedRecord(raw)
}

export async function writeCreationDraft<T>(
  owner: string,
  context: string,
  value: T,
  source = '',
  entryApplied = true,
) {
  const record: CreationDraftRecord<unknown> = {
    version: 1,
    source,
    savedAt: Date.now(),
    entryApplied,
    value: encode(value),
  }
  const key = creationDraftKey(owner, context)
  await queueWrite(key, () =>
    transact<void>('readwrite', (store) => {
      store.put(record, key)
    }),
  )
}

export async function deleteCreationDraft(owner: string, context: string) {
  const key = creationDraftKey(owner, context)
  await queueWrite(key, () =>
    transact<void>('readwrite', (store) => {
      store.delete(key)
    }),
  )
}

const guestEditors = new Map<string, () => Promise<void>>()
export function registerGuestDraft(context: string, flush: () => Promise<void>) {
  guestEditors.set(context, flush)
  return () => {
    if (guestEditors.get(context) === flush) guestEditors.delete(context)
  }
}

/** Only the current tab's explicit login action can hand its guest draft to the next account. */
export async function prepareGuestDraftLogin(returnTo: string) {
  const target = new URL(returnTo, 'https://istudio.local')
  if (!['/studio', '/workbench'].includes(target.pathname)) return
  const query = target.searchParams
  const tool =
    query.get('mode') === 'commerce' ? `commerce:${query.get('task') || 'product-main'}` : 'general'
  const context = creationDraftContext(tool, query.get('projectId') ?? '')
  const flush = guestEditors.get(context)
  if (!flush) return
  await flush()
  sessionStorage.setItem(loginTransferKey, JSON.stringify({ context, createdAt: Date.now() }))
}

export function draftEntrySource(query: Pick<URLSearchParams, 'get'>) {
  return JSON.stringify(
    Object.fromEntries(
      [
        'prompt',
        'model',
        'aspectRatio',
        'resolution',
        'count',
        'resumeTask',
        'review',
        'referenceAsset',
        'reversePrompt',
        'collectionId',
        'collectionHandoff',
        'inspirationId',
      ].flatMap((key) => (query.get(key) === null ? [] : [[key, query.get(key)]])),
    ),
  )
}

export function hasAsyncDraftEntry(source: string) {
  try {
    const query = JSON.parse(source) as Record<string, unknown>
    return ['resumeTask', 'referenceAsset', 'reversePrompt', 'collectionId', 'inspirationId'].some(
      (key) => query[key],
    )
  } catch {
    return false
  }
}

export function creationDraftFingerprint(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof File === 'undefined' || !(item instanceof File)) return item
    if (!fileIdentities.has(item)) fileIdentities.set(item, ++nextFileIdentity)
    return {
      file: item.name,
      size: item.size,
      type: item.type,
      lastModified: item.lastModified,
      identity: fileIdentities.get(item),
    }
  })
}

export function isCreationImage(value: unknown): value is CreationImage {
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (!value || typeof value !== 'object' || !isStoredImage(value as CreationImage)) return false
  const image = value as Record<string, unknown>
  return (
    ['assetId', 'name', 'type', 'contentPath', 'thumbnailPath'].every(
      (key) => typeof image[key] === 'string',
    ) &&
    ['size', 'width', 'height'].every(
      (key) => typeof image[key] === 'number' && Number.isFinite(image[key]),
    )
  )
}
