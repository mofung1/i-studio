'use client'

import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AccountBoundary } from '@/components/account-access'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StudioShell } from '@/components/studio-shell'
import { formatLibraryDate } from '@/lib/library'
import {
  createCanvas,
  deleteCanvas,
  listCanvases,
  renameCanvas,
  type CanvasSummary,
} from '@/lib/canvas'

export function CanvasList() {
  return (
    <AccountBoundary section="canvas" title="画布" description="登录后管理你的无限画布。">
      <CanvasListContent />
    </AccountBoundary>
  )
}

function CanvasListContent() {
  const router = useRouter()
  const [canvases, setCanvases] = useState<CanvasSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const cancelRenameRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCanvases(await listCanvases())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布列表读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async () => {
    setCreating(true)
    setError('')
    try {
      const record = await createCanvas('未命名画布')
      router.push(`/canvas/${record.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '新建画布失败')
      setCreating(false)
    }
  }

  const startRename = (item: CanvasSummary) => {
    cancelRenameRef.current = false
    setRenamingId(item.id)
    setRenameValue(item.name)
    setError('')
  }

  const commitRename = async (item: CanvasSummary) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false
      setRenamingId(null)
      return
    }
    const name = renameValue.trim()
    if (!name || name === item.name) {
      setRenamingId(null)
      return
    }
    setRenameBusy(true)
    setError('')
    try {
      await renameCanvas(item.id, name)
      setCanvases((current) => current.map((c) => (c.id === item.id ? { ...c, name } : c)))
      setRenamingId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布重命名失败')
    } finally {
      setRenameBusy(false)
    }
  }

  const confirmDelete = async () => {
    const id = deletingId
    if (!id) return
    setDeleteBusy(true)
    setError('')
    try {
      await deleteCanvas(id)
      setCanvases((current) => current.filter((item) => item.id !== id))
      setDeletingId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画布删除失败')
    } finally {
      setDeleteBusy(false)
    }
  }

  const newButton = (
    <button type="button" className="studio-primary" onClick={onCreate} disabled={creating}>
      <Plus size={16} aria-hidden="true" />
      {creating ? '新建中…' : '新建画布'}
    </button>
  )

  return (
    <StudioShell section="canvas" title="画布" actions={newButton}>
      <main className="canvas-manager">
        {loading ? (
          <p className="canvas-manager-status" role="status">
            正在读取画布…
          </p>
        ) : canvases.length === 0 ? (
          <div className="canvas-manager-empty">
            <Layers size={34} aria-hidden="true" />
            <strong>还没有画布</strong>
            <p>新建一张无限画布，串联文生文、文生图与图生图任务。</p>
            {newButton}
          </div>
        ) : (
          <ul className="canvas-card-list">
            {canvases.map((item) => (
              <li key={item.id} className="canvas-card">
                {renamingId === item.id ? (
                  <input
                    className="canvas-card-rename-input"
                    value={renameValue}
                    maxLength={120}
                    aria-label="画布名称"
                    disabled={renameBusy}
                    autoFocus
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => void commitRename(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        ;(event.target as HTMLInputElement).blur()
                      } else if (event.key === 'Escape') {
                        cancelRenameRef.current = true
                        ;(event.target as HTMLInputElement).blur()
                      }
                    }}
                  />
                ) : (
                  <>
                    <Link href={`/canvas/${item.id}`} className="canvas-card-open">
                      <span className="canvas-card-name">{item.name}</span>
                      <span className="canvas-card-meta">
                        更新于 {formatLibraryDate(item.updatedAt)} · {item.nodeCount} 节点 ·{' '}
                        {item.edgeCount} 连线
                      </span>
                    </Link>
                    <button
                      type="button"
                      className="canvas-card-rename"
                      aria-label={`重命名画布 ${item.name}`}
                      title="重命名"
                      onClick={() => startRename(item)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="canvas-card-delete"
                      aria-label={`删除画布 ${item.name}`}
                      title="删除画布"
                      onClick={() => setDeletingId(item.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="canvas-manager-error" role="alert">
            {error}
          </p>
        )}
      </main>

      {deletingId && (
        <ConfirmDialog
          title="删除画布"
          description="删除后画布里的节点与连线会一并移除。"
          detail="此操作不可恢复。"
          confirmLabel="删除画布"
          intent="danger"
          busy={deleteBusy}
          error={error}
          onCancel={() => setDeletingId(null)}
          onConfirm={confirmDelete}
        />
      )}
    </StudioShell>
  )
}
