'use client'

import { DialogActions } from '@/components/dialog-actions'
import { useTransientMessage } from '@/hooks/use-transient-message'
import Link from 'next/link'
import { Folder, LoaderCircle, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getAdminAccessToken } from '@/lib/api'
import { adminRequest } from '@/lib/admin'
import type { ManagedInspirationCategory } from '@/lib/inspiration-settings'
import { AdminPagination } from './admin/pagination'
import { AdminDataTable, type AdminColumn, type AdminSorting } from './admin/data-table'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请重试')

export interface CategoryManagerState {
  busy: boolean
  dirty: boolean
}

export function InspirationCategoryManager({
  onChanged,
  onStateChange,
}: {
  onChanged?: (categories: ManagedInspirationCategory[]) => void
  onStateChange?: (state: CategoryManagerState) => void
}) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [categories, setCategories] = useState<ManagedInspirationCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sorting, setSorting] = useState<AdminSorting>([])
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useTransientMessage()
  const [deleting, setDeleting] = useState<ManagedInspirationCategory | null>(null)
  const [moveToId, setMoveToId] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const deleteOpen = deleting !== null
  const dirty =
    !!name.trim() ||
    (!!editing && editing.name.trim() !== categories.find((row) => row.id === editing.id)?.category)

  useEffect(() => {
    onStateChange?.({ busy: !!busy, dirty })
  }, [busy, dirty, onStateChange])

  useEffect(() => {
    setLoggedIn(!!getAdminAccessToken())
  }, [])
  useEffect(() => {
    if (!loggedIn) return
    const controller = new AbortController()
    adminRequest<{ categories: ManagedInspirationCategory[] }>(
      'inspiration/categories?includeDisabled=true',
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setCategories(data.categories)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorText(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loggedIn])
  useEffect(() => {
    if (deleteOpen) dialogRef.current?.showModal()
    else {
      dialogRef.current?.close()
      if (returnFocus.current)
        (returnFocus.current.isConnected ? returnFocus.current : inputRef.current)?.focus()
    }
  }, [deleteOpen])

  async function refresh() {
    const data = await adminRequest<{ categories: ManagedInspirationCategory[] }>(
      'inspiration/categories?includeDisabled=true',
    )
    setCategories(data.categories)
    onChanged?.(data.categories)
    return data.categories
  }
  async function save(event: FormEvent, row?: ManagedInspirationCategory) {
    event.preventDefault()
    const value = (row ? editing?.name : name)?.trim()
    if (!value || busy) return
    setBusy(row?.id ?? 'add')
    setError('')
    setNotice('')
    try {
      await adminRequest(
        `inspiration/categories${row ? `/${encodeURIComponent(row.id)}` : ''}`,
        row ? 'PUT' : 'POST',
        { name: value },
      )
      if (row) setEditing(null)
      else setName('')
      await refresh()
      setNotice(row ? '分类已改名，相关提示词已同步更新' : '分类已新增，可在新增提示词时选择')
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy('')
    }
  }
  async function saveOrder(row: ManagedInspirationCategory) {
    const value = orderDrafts[row.id]
    if (value === undefined || busy) return
    const sortOrder = Number(value)
    if (!value.trim() || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1000000) {
      setError('排序值需为 -1000000 至 1000000 的整数')
      return
    }
    if (sortOrder === (row.sortOrder ?? 0)) return
    setBusy(row.id)
    setError('')
    try {
      await adminRequest(`inspiration/categories/${encodeURIComponent(row.id)}`, 'PUT', {
        sortOrder,
      })
      await refresh()
      setOrderDrafts((previous) => {
        const next = { ...previous }
        delete next[row.id]
        return next
      })
      setNotice('排序已保存，前台分类顺序已更新')
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy('')
    }
  }
  function startDelete(row: ManagedInspirationCategory) {
    returnFocus.current = document.activeElement as HTMLElement
    setDeleteError('')
    setMoveToId('')
    setDeleting(row)
  }
  function closeDelete() {
    if (!busy) setDeleting(null)
  }
  async function deleteCategory() {
    if (!deleting || busy) return
    setBusy('delete')
    setDeleteError('')
    setNotice('')
    try {
      const result = await adminRequest<{ movedCount: number }>(
        `inspiration/categories/${encodeURIComponent(deleting.id)}`,
        'DELETE',
        { moveToId },
      )
      setDeleting(null)
      await refresh()
      setNotice(
        result.movedCount ? `分类已删除，${result.movedCount} 条提示词已迁移` : '空分类已删除',
      )
    } catch (error) {
      setDeleteError(errorText(error))
      try {
        const latest = await refresh()
        setDeleting((previous) =>
          previous ? (latest.find((row) => row.id === previous.id) ?? previous) : null,
        )
      } catch {
        /* The operation error stays visible. */
      }
    } finally {
      setBusy('')
    }
  }
  const filtered = categories.filter((row) =>
    row.category.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const visible = sorting[0]
    ? [...filtered].sort((a, b) => {
        const { id, desc } = sorting[0]!
        const delta =
          id === 'category'
            ? a.category.localeCompare(b.category, 'zh-CN')
            : id === 'sortOrder'
              ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
              : id === 'count'
                ? a.count - b.count
                : a.enabledCount - b.enabledCount
        return (desc ? -delta : delta) || a.id.localeCompare(b.id)
      })
    : filtered
  const destinations = categories.filter((row) => row.id !== deleting?.id)
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedCategories = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const columns: AdminColumn<ManagedInspirationCategory>[] = [
    {
      id: 'sortOrder',
      header: '排序',
      size: 140,
      sortable: true,
      cell: (row) => (
        <input
          className="category-order-input"
          type="number"
          min={-1000000}
          max={1000000}
          step={1}
          aria-label={`分类排序 ${row.category}`}
          value={orderDrafts[row.id] ?? String(row.sortOrder ?? 0)}
          disabled={!!busy || loading}
          onChange={(event) =>
            setOrderDrafts((previous) => ({ ...previous, [row.id]: event.target.value }))
          }
          onBlur={() => void saveOrder(row)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      ),
    },
    {
      id: 'category',
      header: '分类名称',
      size: 290,
      pin: 'left',
      sortable: true,
      cell: (row) =>
        editing?.id === row.id ? (
          <form className="inspiration-category-rename" onSubmit={(event) => void save(event, row)}>
            <input
              autoFocus
              aria-label={`重命名 ${row.category}`}
              required
              maxLength={80}
              value={editing.name}
              disabled={!!busy}
              onChange={(event) => setEditing({ id: row.id, name: event.target.value })}
            />
            <button
              type="submit"
              className="settings-command"
              disabled={!!busy || !editing.name.trim() || editing.name.trim() === row.category}
            >
              <Save size={14} />
              保存
            </button>
            <button
              type="button"
              className="settings-command"
              disabled={!!busy}
              onClick={() => setEditing(null)}
            >
              取消
            </button>
          </form>
        ) : (
          <div className="admin-cell-heading">
            <Folder size={17} aria-hidden="true" />
            <strong>{row.category}</strong>
          </div>
        ),
    },
    {
      id: 'count',
      header: '提示词数量',
      size: 150,
      align: 'right',
      sortable: true,
      cell: (row) => <span className="admin-cell-number">{row.count}</span>,
    },
    {
      id: 'enabledCount',
      header: '已启用',
      size: 130,
      align: 'right',
      sortable: true,
      cell: (row) => <span className="admin-cell-number">{row.enabledCount}</span>,
    },
    {
      id: 'actions',
      header: '操作',
      size: 180,
      pin: 'right',
      cell: (row) =>
        editing?.id !== row.id ? (
          <div className="ops-row-actions">
            <button
              type="button"
              className="settings-command"
              aria-label={`改名 ${row.category}`}
              disabled={!!busy || loading}
              onClick={() => {
                setEditing({ id: row.id, name: row.category })
                setError('')
              }}
            >
              <Pencil size={15} />
              改名
            </button>
            <button
              type="button"
              className="settings-command admin-action"
              data-tone="danger"
              aria-label={`删除分类 ${row.category}`}
              disabled={!!busy || loading}
              onClick={() => startDelete(row)}
            >
              <Trash2 size={15} />
              删除
            </button>
          </div>
        ) : null,
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
      <main className="inspiration-manager-login">
        <p>登录后即可管理灵感分类。</p>
        <Link
          className="studio-primary"
          href="/admin/login?next=%2Fadmin%2Finspiration%2Fcategories"
        >
          登录
        </Link>
      </main>
    )

  return (
    <section className="inspiration-category-manager admin-list-page" aria-label="灵感分类管理">
      <form className="inspiration-category-create" onSubmit={(event) => void save(event)}>
        <label htmlFor="inspiration-new-category">新增分类</label>
        <div>
          <input
            ref={inputRef}
            autoFocus
            id="inspiration-new-category"
            maxLength={80}
            required
            placeholder="例如：产品摄影"
            value={name}
            disabled={!!busy}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="settings-primary" disabled={!!busy || !name.trim()}>
            {busy === 'add' ? (
              <LoaderCircle size={16} className="settings-spinner" aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            新增分类
          </button>
        </div>
      </form>
      <p className="category-order-hint">
        排序值越小越靠前，修改后按 Enter 或移开焦点即可保存，前台同步生效。
      </p>
      <label className="inspiration-manager-search inspiration-category-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="搜索灵感分类"
          placeholder="搜索分类名称"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </label>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="settings-saved" role="status">
          {notice}
        </p>
      )}
      <AdminDataTable
        title="灵感分类列表"
        data={pagedCategories}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next)
          setPage(1)
        }}
        scrollKey={`${currentPage}:${pageSize}:${search}:${JSON.stringify(sorting)}`}
        emptyTitle="暂无分类"
        emptyDescription="调整搜索条件，或新增一个分类。"
      />
      <AdminPagination
        label="分类"
        unit="个"
        page={currentPage}
        pageSize={pageSize}
        total={visible.length}
        totalPages={totalPages}
        loading={loading || !!busy}
        onPageChange={(next) => {
          setEditing(null)
          setPage(next)
        }}
        onPageSizeChange={(size) => {
          setEditing(null)
          setPageSize(size)
          setPage(1)
        }}
      />
      <dialog
        ref={dialogRef}
        className="endpoint-dialog inspiration-category-delete-dialog"
        aria-labelledby="category-delete-title"
        onCancel={(event) => {
          event.preventDefault()
          closeDelete()
        }}
      >
        {deleting && (
          <>
            <div className="endpoint-section-head">
              <h2 id="category-delete-title">删除分类</h2>
              <button
                type="button"
                className="settings-icon"
                aria-label="关闭分类删除"
                disabled={!!busy}
                onClick={closeDelete}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <p className="inspiration-category-delete-note">
              {deleting.count
                ? `“${deleting.category}”下有 ${deleting.count} 条提示词，请选择接收分类。提示词内容和图片会保留。`
                : `删除空分类“${deleting.category}”？`}
            </p>
            {deleting.count > 0 && (
              <label className="settings-field">
                <span>迁移到</span>
                <Select value={moveToId} onValueChange={setMoveToId} disabled={!!busy}>
                  <SelectTrigger aria-label="接收提示词的分类">
                    <SelectValue placeholder="选择接收分类" />
                  </SelectTrigger>
                  <SelectContent portalContainer={dialogRef.current}>
                    <SelectGroup>
                      {destinations.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.category}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {!destinations.length && <small>请先关闭弹窗，新增一个接收分类。</small>}
              </label>
            )}
            {deleteError && (
              <p className="settings-error" role="alert">
                {deleteError}
              </p>
            )}
            <DialogActions className="settings-form-actions">
              <button
                type="button"
                className="settings-command"
                disabled={!!busy}
                onClick={closeDelete}
              >
                取消
              </button>
              <button
                type="button"
                className="settings-primary admin-action"
                data-tone="danger"
                disabled={!!busy || (deleting.count > 0 && !moveToId)}
                onClick={() => void deleteCategory()}
              >
                {busy === 'delete' && (
                  <LoaderCircle size={16} className="settings-spinner" aria-hidden="true" />
                )}
                {deleting.count ? '迁移并删除分类' : '删除空分类'}
              </button>
            </DialogActions>
          </>
        )}
      </dialog>
    </section>
  )
}
