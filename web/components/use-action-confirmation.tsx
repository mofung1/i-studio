'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog'

type Options = Pick<
  ConfirmDialogProps,
  'title' | 'description' | 'detail' | 'confirmLabel' | 'intent'
>
type Pending = { resolve: (confirmed: boolean) => void; session?: string }

/** Confirmation is local to its owner, including nested editor dialogs. */
export function useActionConfirmation(readSession?: () => string) {
  const [options, setOptions] = useState<Options | null>(null)
  const pending = useRef<Pending | null>(null)
  const sessionReader = useRef(readSession)
  sessionReader.current = readSession
  useEffect(
    () => () => {
      pending.current?.resolve(false)
      pending.current = null
    },
    [],
  )
  const ask = useCallback((next: Options) => {
    if (pending.current) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      pending.current = { resolve, session: sessionReader.current?.() }
      setOptions(next)
    })
  }, [])
  function settle(confirmed: boolean) {
    const current = pending.current
    if (!current) return
    pending.current = null
    setOptions(null)
    current.resolve(confirmed && current.session === sessionReader.current?.())
  }
  return {
    ask,
    confirmation: options ? (
      <ConfirmDialog {...options} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
    ) : null,
  }
}
