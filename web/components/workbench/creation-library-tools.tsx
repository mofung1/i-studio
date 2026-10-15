'use client'

import { BookMarked, Plus, RotateCcw, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { LibraryDialog } from '@/components/library-controls'
import { PersonalPromptEditor } from '@/components/personal-prompt-editor'
import { PersonalPromptApply } from '@/components/personal-prompt-apply'
import { getAccessToken } from '@/lib/api'
import { libraryRequest, mergeLibraryPage } from '@/lib/library'
import {
  presetDescription,
  type CreationPreset,
  type PersonalApplication,
  type PersonalPrompt,
} from '@/lib/personal-prompts'

export function CreationLibraryTools({
  config,
  prompt,
  disabled,
  onApply,
  onUndo,
}: {
  onUndo?: () => void
  config: CreationPreset
  prompt: string
  disabled?: boolean
  onApply: (application: PersonalApplication) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'prompt' | 'preset'>('prompt')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PersonalPrompt[]>([])
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState<PersonalPrompt | null>(null)
  const [saved, setSaved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const scope = useRef('')
  scope.current = `${kind}:${query}:${open}:${config.mode}:${config.taskType ?? ''}`
  const presetFilter =
    kind === 'preset'
      ? {
          mode: config.mode,
          ...(config.mode === 'commerce' && config.taskType ? { taskType: config.taskType } : {}),
        }
      : {}
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (!open || !getAccessToken()) return
    const controller = new AbortController()
    setLoading(true)
    setItems([])
    setCursor('')
    setError('')
    void libraryRequest<{ items: PersonalPrompt[]; nextCursor: string }>(
      `personal/prompts?${new URLSearchParams({ kind, q: query, limit: '30', ...presetFilter })}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.items)
          setCursor(data.nextCursor)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, kind, query, attempt, config.mode, config.taskType])
  async function more() {
    if (!cursor || loading) return
    const current = scope.current
    setLoading(true)
    try {
      const data = await libraryRequest<{ items: PersonalPrompt[]; nextCursor: string }>(
        `personal/prompts?${new URLSearchParams({ kind, q: query, limit: '30', cursor, ...presetFilter })}`,
      )
      if (current === scope.current) {
        setItems((previous) => mergeLibraryPage(previous, data.items))
        setCursor(data.nextCursor)
      }
    } catch (reason) {
      if (current === scope.current) setError(reason instanceof Error ? reason.message : '加载失败')
    } finally {
      if (current === scope.current) setLoading(false)
    }
  }
  return (
    <>
      <button
        className="studio-secondary header-collection"
        type="button"
        title="提示词与预设"
        aria-label="提示词与预设"
        disabled={disabled}
        onClick={() => {
          setOpen(true)
          setSaved(false)
        }}
      >
        <BookMarked size={16} />
        <span>提示词与预设</span>
      </button>
      {onUndo && (
        <button
          type="button"
          className="studio-secondary"
          disabled={disabled}
          aria-label="撤销提示词与预设应用"
          title="撤销应用"
          onClick={onUndo}
        >
          <RotateCcw size={16} />
        </button>
      )}
      {open && !saving && !applying && (
        <LibraryDialog title="提示词与创作预设" onClose={() => setOpen(false)}>
          {!getAccessToken() ? (
            <p className="library-count">
              登录后使用自己的提示词与预设。
              <Link href="/login" onClick={() => setOpen(false)}>
                登录
              </Link>
            </p>
          ) : (
            <>
              <div className="creation-library-tabs">
                <button aria-pressed={kind === 'prompt'} onClick={() => setKind('prompt')}>
                  私有提示词
                </button>
                <button aria-pressed={kind === 'preset'} onClick={() => setKind('preset')}>
                  创作预设
                </button>
                <button onClick={() => setSaving(true)}>
                  <Plus size={14} />
                  保存当前预设
                </button>
              </div>
              <label className="library-search">
                <Search size={16} />
                <input
                  type="search"
                  aria-label="搜索可用提示词"
                  placeholder="搜索名称或内容"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {saved && (
                <p className="library-feedback" role="status">
                  当前配置已保存
                </p>
              )}
              {error && (
                <p className="settings-error" role="alert">
                  {error}
                  <button
                    className="library-command"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    重试
                  </button>
                </p>
              )}
              <div className="creation-library-list">
                {items.map((item) => (
                  <button key={item.id} onClick={() => setApplying(item)}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.kind === 'preset' ? presetDescription(item.config) : item.prompt}
                    </span>
                  </button>
                ))}
                {loading && <p className="library-count">正在加载…</p>}
                {!loading && !items.length && !error && (
                  <p className="library-count">暂无匹配内容，可先保存当前配置或创建提示词。</p>
                )}
                {cursor && (
                  <button disabled={loading} onClick={() => void more()}>
                    加载更多
                  </button>
                )}
              </div>
              <Link className="creation-library-manage" href={`/prompts?kind=${kind}`}>
                管理我的提示词与预设
              </Link>
            </>
          )}
        </LibraryDialog>
      )}
      {open && saving && (
        <PersonalPromptEditor
          seed={{ prompt, config }}
          onClose={() => setSaving(false)}
          onSaved={() => {
            setSaving(false)
            setKind('preset')
            setSaved(true)
            setAttempt((value) => value + 1)
          }}
        />
      )}
      {open && applying && (
        <PersonalPromptApply
          item={applying}
          onClose={() => setApplying(null)}
          onApply={async (application) => {
            await onApply(application)
            setApplying(null)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
