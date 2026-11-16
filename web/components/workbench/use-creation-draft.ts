'use client'

import { useEffect, useRef, useState } from 'react'
import {
  creationDraftKey,
  creationDraftFingerprint,
  deleteCreationDraft,
  readCreationDraft,
  hasAsyncDraftEntry,
  registerGuestDraft,
  writeCreationDraft,
} from '@/lib/creation-drafts'

export type DraftStatus = 'loading' | 'saving' | 'saved' | 'error'
interface DraftSession<T> {
  key: string
  owner: string
  context: string
  source: string
  value: T
  ready: boolean
  active: boolean
  queue: Promise<void>
  entryApplied: boolean
  pendingApplied: boolean
  readFailed: boolean
  baseline: string
  dirty: boolean
  pendingWrites: number
  pausedValue: string | null
}

export function useCreationDraft<T>({
  owner,
  context,
  source = '{}',
  enabled,
  value,
  defaultValue,
  emptyValue = defaultValue,
  parse,
  onRestore,
}: {
  owner: string
  context: string
  source?: string
  enabled: boolean
  value: T
  defaultValue: T
  emptyValue?: T
  parse: (value: unknown) => T
  onRestore: (value: T) => void
}) {
  const key = creationDraftKey(owner, context)
  const [readyKey, setReadyKey] = useState('')
  const [status, setStatus] = useState<DraftStatus>('loading')
  const [error, setError] = useState('')
  const [restoredSource, setRestoredSource] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [entryRevision, setEntryRevision] = useState(0)
  const session = useRef<DraftSession<T> | null>(null)
  const latest = useRef({ value, defaultValue, emptyValue, parse, onRestore, source })
  latest.current = { value, defaultValue, emptyValue, parse, onRestore, source }
  if (session.current?.key === key && session.current.ready) {
    session.current.value = value
    session.current.dirty = creationDraftFingerprint(value) !== session.current.baseline
    if (session.current.pendingApplied) {
      session.current.entryApplied = true
      session.current.pendingApplied = false
    }
  }

  function persist(current: DraftSession<T>, next = current.value) {
    if (current.readFailed && !current.dirty) return Promise.reject(new Error('请先重试恢复草稿'))
    current.value = next
    const source = current.source
    const entryApplied = current.entryApplied
    if (current.active) {
      setStatus('saving')
      setError('')
    }
    current.pendingWrites++
    const writing = writeCreationDraft(current.owner, current.context, next, source, entryApplied)
    current.queue = writing
    return writing
      .then(() => {
        if (current.queue === writing) {
          current.readFailed = false
          current.baseline = creationDraftFingerprint(next)
          if (current.active) setStatus('saved')
        }
      })
      .catch((reason: unknown) => {
        if (current.active && current.queue === writing) {
          setStatus('error')
          setError(
            reason &&
              typeof reason === 'object' &&
              'name' in reason &&
              reason.name === 'QuotaExceededError'
              ? '本地空间不足，草稿未保存；请释放浏览器存储后重试'
              : '草稿暂时无法保存，请保留当前页面并重试',
          )
        }
        throw reason
      })
      .finally(() => {
        current.pendingWrites--
      })
  }

  useEffect(() => {
    if (!enabled) return
    if (session.current?.key === key && session.current.ready && !session.current.readFailed) {
      const current = session.current
      current.active = true
      return () => {
        current.active = false
        void persist(current).catch(() => {})
      }
    }
    const initial = latest.current
    const current: DraftSession<T> = {
      key,
      owner,
      context,
      source: initial.source,
      value: initial.value,
      ready: false,
      active: true,
      queue: Promise.resolve(),
      entryApplied: !hasAsyncDraftEntry(initial.source),
      pendingApplied: false,
      readFailed: false,
      baseline: creationDraftFingerprint(initial.value),
      dirty: false,
      pendingWrites: 0,
      pausedValue: null,
    }
    session.current = current
    setReadyKey('')
    setStatus('loading')
    setError('')
    setRestoredSource(null)
    void readCreationDraft(owner, context, initial.parse)
      .then((record) => {
        if (!current.active) return
        const explicitEntry = initial.source !== '{}'
        const restore =
          record &&
          (!explicitEntry || record.source === initial.source || hasAsyncDraftEntry(initial.source))
        const next = restore ? record.value : initial.defaultValue
        // A slower browser read must not replace edits made by a still-mounted caller.
        if (latest.current.value === initial.value) {
          current.value = next
          latest.current.onRestore(next)
          if (restore) {
            current.entryApplied =
              (!explicitEntry || record.source === initial.source) && record.entryApplied !== false
            if (current.entryApplied) setRestoredSource(record.source)
          }
        } else current.value = latest.current.value
        current.baseline = creationDraftFingerprint(current.value)
        current.ready = true
        setReadyKey(key)
        setStatus('saved')
      })
      .catch((reason: unknown) => {
        if (!current.active) return
        if (latest.current.value === initial.value) {
          current.value = initial.defaultValue
          latest.current.onRestore(initial.defaultValue)
        }
        current.ready = true
        current.readFailed = true
        current.baseline = creationDraftFingerprint(current.value)
        setReadyKey(key)
        setStatus('error')
        setError(reason instanceof Error ? reason.message : '草稿无法恢复，请保留当前页面')
      })
    return () => {
      current.active = false
      if (current.ready) void persist(current).catch(() => {})
    }
    // source changes when a handoff URL is consumed; that must not reload the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, owner, context, enabled, attempt])

  useEffect(() => {
    const current = session.current
    if (readyKey !== key || !current?.ready || current.key !== key) return
    if (current.readFailed && !current.dirty) return
    if (current.pausedValue === creationDraftFingerprint(value)) return
    current.pausedValue = null
    setStatus('saving')
    const timer = window.setTimeout(() => {
      if (current.pausedValue === creationDraftFingerprint(current.value)) return
      void persist(current).catch(() => {})
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, readyKey, key, entryRevision])

  useEffect(() => {
    const current = session.current
    if (owner !== 'guest' || readyKey !== key || !current?.ready || current.key !== key) return
    return registerGuestDraft(context, () => persist(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, context, key, readyKey])

  useEffect(() => {
    const flush = () => {
      const current = session.current
      if (current?.ready) void persist(current).catch(() => {})
    }
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', visibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(next?: T) {
    const current = session.current
    if (!current?.ready || current.key !== key) throw new Error('草稿尚未恢复，请稍后重试')
    current.pausedValue = null
    if (next !== undefined) {
      current.entryApplied = true
      current.dirty = true
    }
    await persist(current, next ?? current.value)
  }

  async function clear() {
    const current = session.current
    if (!current?.ready || current.key !== key) throw new Error('草稿尚未恢复，请稍后重试')
    current.value = latest.current.emptyValue
    current.entryApplied = true
    current.readFailed = false
    current.dirty = true
    current.pausedValue = creationDraftFingerprint(current.value)
    latest.current.onRestore(current.value)
    setRestoredSource(current.source)
    setStatus('saving')
    try {
      await current.queue.catch(() => {})
      await deleteCreationDraft(owner, context)
      await persist(current)
      current.pausedValue = null
    } catch (reason) {
      setStatus('error')
      setError('草稿未能清空，请保留当前页面并重试')
      throw reason
    }
  }

  return {
    ready: readyKey === key,
    status: readyKey === key ? status : ('loading' as DraftStatus),
    error,
    restorationFailed: session.current?.key === key && session.current.readFailed,
    restoredSource,
    save,
    flush: save,
    clear,
    retry: async () => {
      if (session.current?.readFailed && !session.current.dirty) setAttempt((value) => value + 1)
      else await save()
    },
    markEntryApplied: () => {
      const current = session.current
      if (!current?.ready || current.key !== key) return
      current.pendingApplied = true
      setEntryRevision((value) => value + 1)
    },
  }
}
