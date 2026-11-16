'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ManagedInspirationCategory } from '@/lib/inspiration-settings'
import {
  InspirationCategoryManager,
  type CategoryManagerState,
} from './inspiration-category-manager'

export function InspirationCategoryDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void
  onChanged: (categories: ManagedInspirationCategory[]) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<CategoryManagerState>({ busy: false, dirty: false })

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  function close() {
    if (state.busy) return
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="endpoint-dialog inspiration-category-dialog"
      aria-labelledby="inspiration-category-dialog-title"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        close()
      }}
    >
      <div className="inspiration-category-dialog-heading">
        <h2 id="inspiration-category-dialog-title">分类管理</h2>
        <button
          type="button"
          className="settings-icon"
          aria-label="关闭分类管理"
          disabled={state.busy}
          onClick={close}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <InspirationCategoryManager onChanged={onChanged} onStateChange={setState} />
    </dialog>
  )
}
