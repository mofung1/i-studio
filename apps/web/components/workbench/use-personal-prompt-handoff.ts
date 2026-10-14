'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { getAccessToken } from '@/lib/api'
import { reverseStorageKey } from '@/lib/prompt-reverse'
import { readPersonalApplication, type PersonalApplication } from '@/lib/personal-prompts'

export function usePersonalPromptHandoff({ ready, onApply, onError }: { ready: boolean; onApply: (application: PersonalApplication) => void | Promise<void>; onError: (message: string) => void }) {
  const search = useSearchParams()
  const id = search.get('collectionId')
  const nonce = search.get('collectionHandoff')
  const handled = useRef('')
  const callbacks = useRef({ onApply, onError }); callbacks.current = { onApply, onError }
  useEffect(() => {
    const token = getAccessToken()
    const key = `${id ?? ''}:${nonce ?? ''}:${token}`
    if (!ready || !id || handled.current === key) return
    const controller = new AbortController()
    void readPersonalApplication(id, nonce, controller.signal).then(async application => {
      if (controller.signal.aborted || getAccessToken() !== token) return
      await callbacks.current.onApply(application)
      handled.current = key
      if (nonce) sessionStorage.removeItem(reverseStorageKey(`creation-handoff:${nonce}`))
    }).catch(reason => { if (!controller.signal.aborted) { handled.current = key; callbacks.current.onError(reason instanceof Error ? reason.message : '应用失败') } })
    return () => controller.abort()
  }, [id, nonce, ready])
}
