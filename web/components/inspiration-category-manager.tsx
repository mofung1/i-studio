'use client'

import Link from 'next/link'
import { Folder, LoaderCircle, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getAdminAccessToken } from '@/lib/api'
import { settingsRequest } from '@/lib/ai-settings'
import type { ManagedInspirationCategory } from '@/lib/inspiration-settings'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败，请重试')

export function InspirationCategoryManager() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [categories, setCategories] = useState<ManagedInspirationCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState<ManagedInspirationCategory | null>(null)
  const [moveToId, setMoveToId] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const deleteOpen = deleting !== null

  useEffect(() => {
    setLoggedIn(!!getAdminAccessToken())
  }, [])
  useEffect(() => {
    if (!loggedIn) return
    const controller = new AbortController()
    settingsRequest<{ categories: ManagedInspirationCategory[] }>(
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
    const data = await settingsRequest<{ categories: ManagedInspirationCategory[] }>(
      'inspiration/categories?includeDisabled=true',
    )
    setCategories(data.categories)
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
      await settingsRequest(
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
      const result = await settingsRequest<{ movedCount: number }>(
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
  const visible = categories.filter((row) =>
    row.category.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const destinations = categories.filter((row) => row.id !== deleting?.id)

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
    <main className="inspiration-category-manager" aria-label="灵感分类管理">
      <form className="inspiration-category-create" onSubmit={(event) => void save(event)}>
        <label htmlFor="inspiration-new-category">新增分类</label>
        <div>
          <input
            ref={inputRef}
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
      <label className="inspiration-manager-search inspiration-category-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="搜索灵感分类"
          placeholder="搜索分类名称"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
      <section className="inspiration-category-list" aria-label="灵感分类列表" aria-busy={loading}>
        {loading ? (
          <div className="settings-loading" role="status">
            <LoaderCircle size={20} className="settings-spinner" aria-hidden="true" />
            正在读取分类
          </div>
        ) : !visible.length ? (
          <p className="settings-empty">
            {search.trim() ? '没有匹配的分类' : '还没有分类，先新增一个分类。'}
          </p>
        ) : (
          visible.map((row) => (
            <article className="inspiration-category-row" key={row.id}>
              <Folder size={18} aria-hidden="true" />
              <div className="inspiration-category-copy">
                {editing?.id === row.id ? (
                  <form
                    className="inspiration-category-rename"
                    onSubmit={(event) => void save(event, row)}
                  >
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
                      disabled={
                        !!busy || !editing.name.trim() || editing.name.trim() === row.category
                      }
                    >
                      <Save size={15} aria-hidden="true" />
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
                  <h2>{row.category}</h2>
                )}
                <p>
                  {row.count} 条提示词 · {row.enabledCount} 条已启用
                </p>
              </div>
              {editing?.id !== row.id && (
                <div className="inspiration-category-actions">
                  <button
                    type="button"
                    className="settings-command"
                    aria-label={`改名 ${row.category}`}
                    disabled={!!busy}
                    onClick={() => {
                      setEditing({ id: row.id, name: row.category })
                      setError('')
                    }}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    改名
                  </button>
                  <button
                    type="button"
                    className="settings-command"
                    aria-label={`删除分类 ${row.category}`}
                    disabled={!!busy}
                    onClick={() => startDelete(row)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    删除
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
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
            <div className="settings-form-actions">
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
                className="settings-primary"
                disabled={!!busy || (deleting.count > 0 && !moveToId)}
                onClick={() => void deleteCategory()}
              >
                {busy === 'delete' && (
                  <LoaderCircle size={16} className="settings-spinner" aria-hidden="true" />
                )}
                {deleting.count ? '迁移并删除分类' : '删除空分类'}
              </button>
            </div>
          </>
        )}
      </dialog>
    </main>
  )
}
