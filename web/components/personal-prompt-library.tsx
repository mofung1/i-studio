'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookMarked,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioShell } from './studio-shell'
import { LibrarySelect } from './library-controls'
import { ConfirmDialog } from './confirm-dialog'
import { PersonalPromptEditor } from './personal-prompt-editor'
import { PersonalPromptApply } from './personal-prompt-apply'
import { libraryRequest, mergeLibraryPage } from '@/lib/library'
import { copyText } from '@/lib/clipboard'
import { getAccessToken } from '@/lib/api'
import { AccountBoundary } from './account-access'
import {
  personalWorkbenchURL,
  presetDescription,
  type PersonalPrompt,
} from '@/lib/personal-prompts'

export function PersonalPromptLibrary({ kind }: { kind: 'prompt' | 'preset' }) {
  return (
    <AccountBoundary
      section="prompts"
      title={kind === 'preset' ? '创作预设' : '我的提示词'}
      description="保存常用提示词与创作配置，建立只属于自己的创作库。"
      returnTo={`/prompts?kind=${kind}`}
    >
      <PersonalPromptLibraryContent kind={kind} />
    </AccountBoundary>
  )
}

function PersonalPromptLibraryContent({ kind }: { kind: 'prompt' | 'preset' }) {
  const router = useRouter()
  const [items, setItems] = useState<PersonalPrompt[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [trash, setTrash] = useState(false)
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [cursor, setCursor] = useState('')
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<PersonalPrompt | 'new' | null>(null)
  const [applying, setApplying] = useState<PersonalPrompt | null>(null)
  const [deleting, setDeleting] = useState<PersonalPrompt | null>(null)
  const [busy, setBusy] = useState('')
  const epoch = useRef(0)
  const params = new URLSearchParams({ kind, limit: '40' })
  if (query) params.set('q', query)
  if (category !== 'all') params.set('category', category.slice(2))
  if (favorite) params.set('favorite', 'true')
  if (trash) params.set('trash', 'true')
  const key = params.toString()
  const filterRef = useRef(key)
  filterRef.current = key
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const load = useCallback(
    async (next = '', signal?: AbortSignal) => {
      const id = epoch.current
      const queryParams = new URLSearchParams(key)
      if (next) queryParams.set('cursor', next)
      try {
        const data = await libraryRequest<{
          items: PersonalPrompt[]
          categories: string[]
          total: number
          nextCursor: string
        }>(`personal/prompts?${queryParams}`, { signal })
        if (signal?.aborted || id !== epoch.current || key !== filterRef.current) return
        setItems((previous) => (next ? mergeLibraryPage(previous, data.items) : data.items))
        setCategories(data.categories)
        setTotal(data.total)
        setCursor(data.nextCursor)
        setError('')
      } catch (reason) {
        if (!signal?.aborted && id === epoch.current && key === filterRef.current)
          setError(reason instanceof Error ? reason.message : '读取失败')
      } finally {
        if (!signal?.aborted && id === epoch.current && key === filterRef.current) {
          setLoading(false)
          setMoreBusy(false)
        }
      }
    },
    [key],
  )
  const reloadRef = useRef(load)
  reloadRef.current = load
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/prompts?kind=${kind}`)}`)
      return
    }
    epoch.current += 1
    const controller = new AbortController()
    setLoading(true)
    setItems([])
    setCursor('')
    setMoreBusy(false)
    void load('', controller.signal)
    return () => controller.abort()
  }, [load, router, kind])
  async function action(id: string, execute: () => Promise<void>, success = '') {
    if (busy) return
    setBusy(id)
    setError('')
    setNotice('')
    try {
      await execute()
      if (success) setNotice(success)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setBusy('')
    }
  }
  async function updateFavorite(item: PersonalPrompt) {
    await libraryRequest(`personal/prompts/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite: !item.favorite }),
    })
    await reloadRef.current()
  }
  function resetFilters() {
    setSearch('')
    setQuery('')
    setCategory('all')
    setFavorite(false)
    setTrash(false)
  }
  return (
    <StudioShell
      section="prompts"
      title="我的提示词"
      actions={
        kind === 'prompt' ? (
          <button
            className="studio-primary"
            onClick={() => {
              setError('')
              setEditing('new')
            }}
          >
            <Plus size={16} />
            新增提示词
          </button>
        ) : (
          <Link className="studio-primary" href="/workbench?mode=general">
            <Plus size={16} />
            到工作台保存预设
          </Link>
        )
      }
    >
      <main className="personal-library">
        <div className="personal-library-head">
          <nav className="library-views" aria-label="个人创作库">
            <Link
              href="/prompts"
              aria-current={kind === 'prompt' ? 'page' : undefined}
              onClick={resetFilters}
            >
              <BookMarked size={16} />
              私有提示词
            </Link>
            <Link
              href="/prompts?kind=preset"
              aria-current={kind === 'preset' ? 'page' : undefined}
              onClick={resetFilters}
            >
              <SlidersHorizontal size={16} />
              创作预设
            </Link>
          </nav>
          <span className="library-count">仅自己可见 · {total} 条</span>
        </div>
        <div className="personal-library-toolbar">
          <label className="library-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索我的提示词"
              placeholder="搜索名称、内容或标签"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <LibrarySelect
            label="筛选私有分类"
            value={category}
            options={[
              ['all', '全部分类'],
              ...categories.map((value) => [`c:${value}`, value] as [string, string]),
            ]}
            onChange={setCategory}
          />
          <button
            className={`library-command${favorite ? ' active' : ''}`}
            aria-pressed={favorite}
            onClick={() => setFavorite(!favorite)}
          >
            <Star size={15} />
            收藏
          </button>
          <button
            className={`library-command${trash ? ' active' : ''}`}
            aria-pressed={trash}
            onClick={() => setTrash(!trash)}
          >
            <Trash2 size={15} />
            回收站
          </button>
          <button
            className="library-command"
            aria-label="刷新私有提示词"
            disabled={loading}
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {error && (
          <p className="library-feedback is-error" role="alert">
            {error}
            <button onClick={() => void load()}>重试</button>
          </p>
        )}
        {notice && (
          <p className="library-feedback" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <div className="personal-prompt-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="personal-prompt-card is-skeleton">
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
            ))}
          </div>
        ) : (
          <div className="personal-prompt-grid">
            {items.map((item) => (
              <article className="personal-prompt-card" key={item.id}>
                <header>
                  <span>{item.category || '未分类'}</span>
                  {!trash && (
                    <button
                      aria-label={item.favorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
                      aria-pressed={item.favorite}
                      disabled={!!busy}
                      onClick={() => void action(item.id, () => updateFavorite(item))}
                    >
                      <Star size={16} fill={item.favorite ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </header>
                <h2>{item.title}</h2>
                <p className="personal-prompt-excerpt">
                  {item.prompt || presetDescription(item.config)}
                </p>
                {item.kind === 'preset' && item.prompt && (
                  <p className="personal-preset-caption">{presetDescription(item.config)}</p>
                )}
                <div className="asset-tags">
                  {item.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <footer>
                  <span>v{item.version}</span>
                  {trash ? (
                    <button
                      className="studio-secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void action(
                          item.id,
                          async () => {
                            await libraryRequest(`personal/prompts/${item.id}/restore`, {
                              method: 'POST',
                            })
                            await reloadRef.current()
                          },
                          '内容已恢复',
                        )
                      }
                    >
                      恢复
                    </button>
                  ) : (
                    <>
                      <button
                        aria-label={`复制 ${item.title}`}
                        title="复制"
                        disabled={!!busy || !item.prompt}
                        onClick={() => void action('copy', () => copyText(item.prompt), '已复制')}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        aria-label={`编辑 ${item.title}`}
                        title="编辑与版本记录"
                        onClick={() => {
                          setError('')
                          setEditing(item)
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        aria-label={`删除 ${item.title}`}
                        title="移入回收站"
                        onClick={() => setDeleting(item)}
                      >
                        <Trash2 size={15} />
                      </button>
                      <button className="studio-primary" onClick={() => setApplying(item)}>
                        应用
                      </button>
                    </>
                  )}
                </footer>
              </article>
            ))}
          </div>
        )}
        {!loading && !items.length && !error && (
          <div className="library-empty-state">
            <BookMarked size={32} />
            <strong>
              {trash
                ? '回收站为空'
                : query || favorite || category !== 'all'
                  ? '没有匹配内容'
                  : kind === 'preset'
                    ? '把常用配置保存为创作预设'
                    : '建立自己的提示词收藏'}
            </strong>
            <p>
              {kind === 'preset'
                ? '在工作台点击“提示词与预设”，保存当前模型、比例、风格和描述。'
                : '新增提示词，或从灵感、作品和图片反推中保存。'}
            </p>
          </div>
        )}
        {cursor && (
          <button
            className="library-load-more"
            disabled={moreBusy}
            onClick={() => {
              setMoreBusy(true)
              void load(cursor)
            }}
          >
            {moreBusy ? '正在加载…' : '加载更多'}
          </button>
        )}
      </main>
      {editing && (
        <PersonalPromptEditor
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? undefined : editing}
          seed={editing === 'new' ? { prompt: '' } : undefined}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setNotice('已保存到个人创作库')
            void reloadRef.current()
          }}
        />
      )}
      {applying && (
        <PersonalPromptApply
          item={applying}
          onClose={() => setApplying(null)}
          onApply={(_application, values) => {
            router.push(personalWorkbenchURL(applying, values))
            setApplying(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="移入回收站？"
          description={deleting.title}
          detail="内容与版本记录会保留，可从回收站恢复。"
          confirmLabel="移入回收站"
          busy={!!busy}
          error={error}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void action(
              'delete',
              async () => {
                await libraryRequest(`personal/prompts/${deleting.id}`, { method: 'DELETE' })
                setDeleting(null)
                await reloadRef.current()
              },
              '已移入回收站',
            )
          }
        />
      )}
    </StudioShell>
  )
}
