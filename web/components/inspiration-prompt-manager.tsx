'use client'
import { DialogActions } from '@/components/dialog-actions'
import { AdminPageHeader } from './admin/page-header'

import Link from 'next/link'
import {
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
import { adminRequest } from '@/lib/admin'
import {
  inspirationDraft,
  type InspirationManagementResponse,
  type InspirationPromptInput,
  type ManagedInspirationCategory,
  type ManagedInspirationPrompt,
} from '@/lib/inspiration-settings'
import { ConfirmDialog } from './confirm-dialog'
import { InspirationCategoryDialog } from './inspiration-category-dialog'
import { AdminPagination } from './admin/pagination'
import { AdminDataTable, type AdminColumn } from './admin/data-table'
import { AdminStatusBadge } from './admin/status-badge'
import type { InspirationCategory } from './workbench/use-inspiration-prompts'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请重试')

export function InspirationPromptManager() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [items, setItems] = useState<ManagedInspirationPrompt[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<InspirationCategory[]>([])
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
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
    setCategoryManagerOpen(new URLSearchParams(window.location.search).get('categories') === '1')
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
      pageSize: String(pageSize),
      q: filters.query,
      category: filters.category,
      status: filters.status,
    })
    Promise.all([
      adminRequest<InspirationManagementResponse>(
        `inspiration/prompts?${params}`,
        'GET',
        undefined,
        controller.signal,
      ),
      adminRequest<{ categories: InspirationCategory[] }>(
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
          if (data.page !== filters.page)
            setFilters((previous) => ({ ...previous, page: data.page }))
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
  }, [loggedIn, filters.query, filters.category, filters.status, filters.page, refresh, pageSize])
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
      await adminRequest(
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
      const { category } = await adminRequest<{ category: ManagedInspirationCategory }>(
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
      await adminRequest(`inspiration/prompts/${encodeURIComponent(deleting.id)}`, 'DELETE')
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

  const columns: AdminColumn<ManagedInspirationPrompt>[] = [
    {
      id: 'title',
      header: '灵感提示词',
      size: 310,
      pin: 'left',
      cell: (item) => (
        <div className="admin-prompt-title">
          {item.imageUrl && (
            <img
              src={item.imageUrl.startsWith('/') ? `${apiBaseUrl}${item.imageUrl}` : item.imageUrl}
              alt=""
              loading="lazy"
            />
          )}
          <strong>{item.title}</strong>
        </div>
      ),
    },
    { id: 'category', header: '分类', size: 130, cell: (item) => item.category || '未分类' },
    {
      id: 'prompt',
      header: '提示词',
      size: 320,
      cell: (item) => (
        <p className="admin-prompt-excerpt" title={item.prompt}>
          {item.prompt}
        </p>
      ),
    },
    { id: 'source', header: '来源', size: 140, cell: (item) => item.source || '—' },
    {
      id: 'status',
      header: '状态',
      size: 110,
      cell: (item) => (
        <AdminStatusBadge tone={item.enabled ? 'success' : 'danger'}>
          {item.enabled ? '已启用' : '未启用'}
        </AdminStatusBadge>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      size: 180,
      pin: 'right',
      cell: (item) =>
        item.submissionId ? (
          <a
            className="settings-command"
            href={`/admin/submissions?id=${encodeURIComponent(item.submissionId)}`}
          >
            查看投稿
          </a>
        ) : (
          <div className="ops-row-actions">
            <button
              type="button"
              className="settings-command"
              aria-label={`编辑 ${item.title}`}
              disabled={loading}
              onClick={() => edit(item)}
            >
              <Pencil size={15} />
              编辑
            </button>
            <button
              type="button"
              className="settings-command admin-action"
              data-tone="danger"
              aria-label={`删除 ${item.title}`}
              disabled={loading}
              onClick={() => {
                setDeleteError('')
                setDeleting(item)
              }}
            >
              <Trash2 size={15} />
              删除
            </button>
          </div>
        ),
    },
  ]

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
    <main className="inspiration-manager admin-list-page">
      <AdminPageHeader title="公共灵感库" />
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
          onClick={() => {
            setNotice('')
            setRefresh((value) => value + 1)
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
        <button
          type="button"
          className="settings-command"
          aria-haspopup="dialog"
          onClick={() => setCategoryManagerOpen(true)}
        >
          <Folder size={16} aria-hidden="true" />
          分类管理
        </button>
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
      <AdminDataTable
        title="灵感提示词列表"
        data={items}
        columns={columns}
        getRowId={(item) => item.id}
        loading={loading}
        scrollKey={`${filters.page}:${filters.query}:${filters.category}:${filters.status}:${pageSize}`}
        emptyTitle={error ? '列表暂时无法读取' : '暂无灵感提示词'}
        emptyDescription={
          error ? '点击刷新后重试。' : '调整筛选条件，或点击「新增提示词」添加内容。'
        }
      />
      {!error && (
        <AdminPagination
          label="提示词"
          page={filters.page}
          pageSize={pageSize}
          total={total}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          loading={loading}
          onPageChange={(page) => setFilters((previous) => ({ ...previous, page }))}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setFilters((previous) => ({ ...previous, page: 1 }))
          }}
        />
      )}
      {categoryManagerOpen && (
        <InspirationCategoryDialog
          onClose={() => {
            setCategoryManagerOpen(false)
            const url = new URL(window.location.href)
            if (url.searchParams.has('categories')) {
              url.searchParams.delete('categories')
              window.history.replaceState(
                window.history.state,
                '',
                url.pathname + url.search + url.hash,
              )
            }
          }}
          onChanged={(latest) => {
            const activeCategory = categories.find((row) => row.category === filters.category)
            setCategories(latest)
            setFilters((previous) => ({
              ...previous,
              category: activeCategory
                ? (latest.find((row) => row.id === activeCategory.id)?.category ?? '')
                : previous.category,
            }))
            setRefresh((value) => value + 1)
          }}
        />
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
            <DialogActions sticky className="settings-form-actions">
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
            </DialogActions>
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
