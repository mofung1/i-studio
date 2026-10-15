'use client'

import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiBaseUrl, getAdminAccessToken } from '@/lib/api'
import { settingsRequest } from '@/lib/ai-settings'
import {
  inspirationDraft,
  type InspirationManagementResponse,
  type InspirationPromptInput,
  type ManagedInspirationCategory,
  type ManagedInspirationPrompt,
} from '@/lib/inspiration-settings'
import { ConfirmDialog } from './confirm-dialog'
import type { InspirationCategory } from './workbench/use-inspiration-prompts'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const PAGE_SIZE = 20
const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请重试')

export function InspirationPromptManager() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [items, setItems] = useState<ManagedInspirationPrompt[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<InspirationCategory[]>([])
  const [filters, setFilters] = useState({ query: '', category: '', status: 'all', page: 1 })
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<{
    item?: ManagedInspirationPrompt
    draft: InspirationPromptInput
    initial: InspirationPromptInput
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [deleting, setDeleting] = useState<ManagedInspirationPrompt | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const focusRef = useRef<HTMLElement | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const editorOpen = editing !== null
  const dirty =
    (!!editing && JSON.stringify(editing.draft) !== JSON.stringify(editing.initial)) ||
    (addingCategory && !!categoryName.trim())

  useEffect(() => {
    setLoggedIn(!!getAdminAccessToken())
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setFilters((previous) =>
          previous.query === search.trim()
            ? previous
            : { ...previous, query: search.trim(), page: 1 },
        ),
      350,
    )
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (!loggedIn) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      includeDisabled: 'true',
      page: String(filters.page),
      pageSize: String(PAGE_SIZE),
      q: filters.query,
      category: filters.category,
      status: filters.status,
    })
    Promise.all([
      settingsRequest<InspirationManagementResponse>(
        `inspiration/prompts?${params}`,
        'GET',
        undefined,
        controller.signal,
      ),
      settingsRequest<{ categories: InspirationCategory[] }>(
        'inspiration/categories?includeDisabled=true',
        'GET',
        undefined,
        controller.signal,
      ),
    ])
      .then(([data, categoryData]) => {
        if (!controller.signal.aborted) {
          setItems(data.prompts)
          setTotal(data.total)
          setCategories(categoryData.categories)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorText(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loggedIn, filters.query, filters.category, filters.status, filters.page, refresh])
  useEffect(() => {
    if (editorOpen) dialogRef.current?.showModal()
    else {
      dialogRef.current?.close()
      ;(focusRef.current?.isConnected ? focusRef.current : addRef.current)?.focus()
    }
  }, [editorOpen])
  useEffect(() => {
    if (!dirty) return
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnOnLeave)
    return () => window.removeEventListener('beforeunload', warnOnLeave)
  }, [dirty])

  function edit(item?: ManagedInspirationPrompt) {
    focusRef.current = document.activeElement as HTMLElement
    setEditorError('')
    setNotice('')
    const draft = inspirationDraft(item)
    if (!item && filters.category) draft.category = filters.category
    setEditing({ item, draft, initial: draft })
    setAddingCategory(false)
    setCategoryName('')
    setCategoryError('')
  }
  function closeEditor() {
    if (saving || categorySaving || (dirty && !window.confirm('放弃尚未保存的提示词修改？'))) return
    setEditing(null)
  }
  function field(patch: Partial<InspirationPromptInput>) {
    setEditing((previous) =>
      previous ? { ...previous, draft: { ...previous.draft, ...patch } } : null,
    )
    setEditorError('')
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    setSaving(true)
    setEditorError('')
    try {
      const categoryId = categories.find(
        (category) => category.category === editing.draft.category,
      )?.id
      await settingsRequest(
        `inspiration/prompts${editing.item ? `/${encodeURIComponent(editing.item.id)}` : ''}`,
        editing.item ? 'PUT' : 'POST',
        { ...editing.draft, categoryId },
      )
      setNotice(editing.item ? '提示词已保存' : '提示词已新增')
      if (!editing.item) {
        setSearch('')
        setFilters({ query: '', category: '', status: 'all', page: 1 })
      }
      setEditing(null)
      setRefresh((value) => value + 1)
    } catch (error) {
      setEditorError(errorText(error))
    } finally {
      setSaving(false)
    }
  }
  async function createCategory() {
    if (!categoryName.trim() || categorySaving) return
    setCategorySaving(true)
    setCategoryError('')
    try {
      const { category } = await settingsRequest<{ category: ManagedInspirationCategory }>(
        'inspiration/categories',
        'POST',
        { name: categoryName.trim() },
      )
      setCategories((previous) => [
        ...previous.filter((item) => item.category !== category.category),
        category,
      ])
      field({ category: category.category })
      setAddingCategory(false)
      setCategoryName('')
    } catch (error) {
      setCategoryError(errorText(error))
    } finally {
      setCategorySaving(false)
    }
  }
  async function deletePrompt() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await settingsRequest(`inspiration/prompts/${encodeURIComponent(deleting.id)}`, 'DELETE')
      setDeleting(null)
      setNotice('提示词已删除')
      if (items.length === 1 && filters.page > 1)
        setFilters((previous) => ({ ...previous, page: previous.page - 1 }))
      setRefresh((value) => value + 1)
    } catch (error) {
      setDeleteError(errorText(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loggedIn === null)
    return (
      <div className="settings-loading" role="status">
        正在读取账号状态
      </div>
    )
  if (!loggedIn)
    return (
      <div className="inspiration-manager-login">
        <p>登录后即可管理灵感提示词。</p>
        <Link className="studio-primary" href="/admin/login?next=%2Fadmin%2Finspiration">
          登录
        </Link>
      </div>
    )

  return (
    <main className="inspiration-manager">
      <div className="inspiration-manager-toolbar" role="search" aria-label="搜索与筛选提示词">
        <label className="inspiration-manager-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索管理提示词"
            placeholder="搜索标题、提示词或来源"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Select
          value={filters.category ? `category:${filters.category}` : 'all'}
          onValueChange={(value) =>
            setFilters((previous) => ({
              ...previous,
              category: value === 'all' ? '' : value.slice('category:'.length),
              page: 1,
            }))
          }
        >
          <SelectTrigger
            size="lg"
            className="inspiration-manager-category"
            aria-label="提示词分类筛选"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部分类</SelectItem>
              {Array.from(
                new Set([
                  ...categories.map((item) => item.category),
                  ...(filters.category ? [filters.category] : []),
                ]),
              ).map((category) => (
                <SelectItem key={category} value={`category:${category}`}>
                  {category}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(status) => setFilters((previous) => ({ ...previous, status, page: 1 }))}
        >
          <SelectTrigger
            size="lg"
            className="inspiration-manager-status"
            aria-label="提示词状态筛选"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="enabled">已启用</SelectItem>
              <SelectItem value="disabled">未启用</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <button
          type="button"
          className="settings-command"
          aria-label="刷新提示词列表"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
        <Link className="settings-command" href="/admin/inspiration/categories">
          <Folder size={16} aria-hidden="true" />
          分类管理
        </Link>
        <button ref={addRef} type="button" className="settings-primary" onClick={() => edit()}>
          <Plus size={17} aria-hidden="true" />
          新增提示词
        </button>
      </div>
      {notice && (
        <p className="settings-saved" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      <section className="inspiration-manager-list" aria-label="管理提示词列表" aria-busy={loading}>
        {loading ? (
          <div className="settings-loading" role="status">
            <LoaderCircle className="settings-spinner" size={20} />
            正在读取提示词
          </div>
        ) : error ? null : !items.length ? (
          <p className="inspiration-manager-empty">
            {filters.query || filters.category || filters.status !== 'all'
              ? '没有符合筛选条件的提示词'
              : '灵感库还没有提示词，点击「新增提示词」开始添加。'}
          </p>
        ) : (
          items.map((item) => (
            <article className="inspiration-manager-row" key={item.id}>
              {item.imageUrl && (
                <img
                  className="inspiration-manager-cover"
                  src={
                    item.imageUrl.startsWith('/') ? `${apiBaseUrl}${item.imageUrl}` : item.imageUrl
                  }
                  alt=""
                  loading="lazy"
                />
              )}
              <div className="inspiration-manager-copy">
                <div className="inspiration-manager-title">
                  <h2>{item.title}</h2>
                  <span
                    className={
                      item.enabled
                        ? 'inspiration-manager-badge'
                        : 'inspiration-manager-badge is-disabled'
                    }
                  >
                    {item.enabled ? '已启用' : '未启用'}
                  </span>
                </div>
                <p className="inspiration-manager-meta">
                  {[item.category, item.source].filter(Boolean).join(' · ')}
                </p>
                <p className="inspiration-manager-excerpt">{item.prompt}</p>
              </div>
              <div className="inspiration-manager-actions">
                <button
                  type="button"
                  className="settings-command"
                  aria-label={`编辑 ${item.title}`}
                  onClick={() => edit(item)}
                >
                  <Pencil size={16} aria-hidden="true" />
                  编辑
                </button>
                <button
                  type="button"
                  className="settings-command admin-action"
                  data-tone="danger"
                  aria-label={`删除 ${item.title}`}
                  onClick={() => {
                    setDeleteError('')
                    setDeleting(item)
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  删除
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      {!error && (
        <div className="inspiration-manager-pagination">
          <span>
            共 {total} 条 · 第 {filters.page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
          </span>
          <div>
            <button
              type="button"
              className="settings-command"
              aria-label="上一页"
              disabled={loading || filters.page <= 1}
              onClick={() => setFilters((previous) => ({ ...previous, page: previous.page - 1 }))}
            >
              <ChevronLeft size={17} aria-hidden="true" />
              上一页
            </button>
            <button
              type="button"
              className="settings-command"
              aria-label="下一页"
              disabled={loading || filters.page * PAGE_SIZE >= total}
              onClick={() => setFilters((previous) => ({ ...previous, page: previous.page + 1 }))}
            >
              下一页
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="endpoint-dialog inspiration-editor-dialog"
        aria-labelledby="inspiration-editor-title"
        onCancel={(event) => {
          event.preventDefault()
          closeEditor()
        }}
      >
        {editing && (
          <form onSubmit={save} aria-busy={saving}>
            <div className="endpoint-section-head">
              <h2 id="inspiration-editor-title">{editing.item ? '编辑提示词' : '新增提示词'}</h2>
              <button
                type="button"
                className="settings-icon"
                aria-label="关闭提示词编辑"
                disabled={saving || categorySaving}
                onClick={closeEditor}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {editorError && (
              <p className="settings-error" role="alert">
                {editorError}
              </p>
            )}
            <fieldset disabled={saving || categorySaving} className="inspiration-editor-fields">
              <label className="settings-field">
                <span>标题</span>
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={editing.draft.title}
                  onChange={(event) => field({ title: event.target.value })}
                />
              </label>
              <div className="endpoint-form-grid">
                <div className="settings-field inspiration-editor-category">
                  <label htmlFor="inspiration-prompt-category">分类</label>
                  <Select
                    key={JSON.stringify(categories.map((category) => category.category))}
                    value={editing.draft.category ? `category:${editing.draft.category}` : ''}
                    onValueChange={(value) => field({ category: value.slice('category:'.length) })}
                    disabled={saving || categorySaving}
                  >
                    <SelectTrigger id="inspiration-prompt-category" aria-label="提示词分类">
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent
                      portalContainer={dialogRef.current}
                      className="endpoint-dialog-select-content"
                    >
                      <SelectGroup>
                        {categories.map((category) => (
                          <SelectItem
                            value={`category:${category.category}`}
                            key={category.category}
                          >
                            {category.category}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {addingCategory ? (
                    <div className="inspiration-inline-category">
                      <input
                        autoFocus
                        aria-label="新增分类名称"
                        maxLength={80}
                        placeholder="输入分类名称"
                        value={categoryName}
                        onChange={(event) => setCategoryName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void createCategory()
                          }
                        }}
                      />
                      <div>
                        <button
                          type="button"
                          className="settings-command"
                          disabled={!categoryName.trim() || categorySaving}
                          onClick={() => void createCategory()}
                        >
                          {categorySaving ? '新增中…' : '新增并选择'}
                        </button>
                        <button
                          type="button"
                          className="settings-command"
                          disabled={categorySaving}
                          onClick={() => setAddingCategory(false)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inspiration-category-add"
                      onClick={() => {
                        setAddingCategory(true)
                        setCategoryError('')
                      }}
                    >
                      <Plus size={14} aria-hidden="true" />
                      新增分类
                    </button>
                  )}
                  {!categories.length && !addingCategory && <small>暂无分类，请先新增分类。</small>}
                  {categoryError && (
                    <p className="settings-error" role="alert">
                      {categoryError}
                    </p>
                  )}
                </div>
                <label className="settings-field">
                  <span>来源（可选）</span>
                  <input
                    maxLength={500}
                    value={editing.draft.source}
                    onChange={(event) => field({ source: event.target.value })}
                  />
                </label>
              </div>
              <div className="settings-field">
                <label htmlFor="inspiration-prompt-content">提示词内容</label>
                <textarea
                  id="inspiration-prompt-content"
                  required
                  maxLength={20000}
                  rows={9}
                  value={editing.draft.prompt}
                  onChange={(event) => field({ prompt: event.target.value })}
                />
              </div>
              <div className="inspiration-editor-options">
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={editing.draft.enabled}
                    onChange={(event) => field({ enabled: event.target.checked })}
                  />
                  启用并展示在灵感库
                </label>
                <label className="settings-field inspiration-order-field">
                  <span>排序（越小越靠前）</span>
                  <input
                    type="number"
                    min={-1000000}
                    max={1000000}
                    step={1}
                    required
                    value={editing.draft.sortOrder}
                    onChange={(event) => field({ sortOrder: Number(event.target.value) })}
                  />
                </label>
              </div>
            </fieldset>
            <div className="settings-form-actions">
              <button
                type="button"
                className="settings-command"
                disabled={saving || categorySaving}
                onClick={closeEditor}
              >
                取消
              </button>
              <button
                type="submit"
                className="settings-primary"
                disabled={
                  saving ||
                  categorySaving ||
                  !dirty ||
                  !editing.draft.title.trim() ||
                  !categories.some((category) => category.category === editing.draft.category) ||
                  !editing.draft.prompt.trim()
                }
              >
                {saving ? (
                  <LoaderCircle size={16} className="settings-spinner" aria-hidden="true" />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {saving ? '保存中' : '保存提示词'}
              </button>
            </div>
          </form>
        )}
      </dialog>
      {deleting && (
        <ConfirmDialog
          title="删除灵感提示词"
          description={`删除“${deleting.title}”后，它将从灵感库移除。`}
          detail="删除后不可恢复"
          confirmLabel="删除提示词"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void deletePrompt()}
        />
      )}
    </main>
  )
}
