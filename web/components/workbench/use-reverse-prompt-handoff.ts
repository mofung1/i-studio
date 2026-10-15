'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadProtectedImage } from '@/components/authenticated-image'
import { reverseRequest, reverseStorageKey, type ReverseTask } from '@/lib/prompt-reverse'

export function useReversePromptHandoff({
  ready,
  onApply,
  onError,
}: {
  ready: boolean
  onApply: (text: string, file?: File) => void
  onError: (message: string) => void
}) {
  const search = useSearchParams()
  const router = useRouter()
  const id = search.get('reversePrompt')
  const callbacks = useRef({ onApply, onError })
  callbacks.current = { onApply, onError }
  const handled = useRef('')
  useEffect(() => {
    if (!id) {
      handled.current = ''
      return
    }
    if (!ready || handled.current === id) return
    const controller = new AbortController()
    async function load() {
      try {
        const pending = JSON.parse(
          localStorage.getItem(reverseStorageKey('handoff')) ?? 'null',
        ) as { id: string; text: string; includeReference: boolean; createdAt: number } | null
        if (
          !pending ||
          pending.id !== id ||
          typeof pending.text !== 'string' ||
          !pending.text.trim() ||
          pending.text.length > 10000 ||
          Date.now() - pending.createdAt > 24 * 3600000
        )
          throw new Error('反推描述已失效，请重新打开图片反推并应用结果')
        const data = await reverseRequest<{ task: ReverseTask }>(
          `prompts/reverse/${encodeURIComponent(id!)}`,
          { signal: controller.signal },
        )
        if (data.task.status !== 'succeeded')
          throw new Error('图片分析尚未完成，请完成分析后再应用')
        let file: File | undefined
        if (pending.includeReference) {
          const image = await loadProtectedImage(data.task.imageUrl)
          file = new File([image.blob], data.task.imageName, { type: image.blob.type })
        }
        if (controller.signal.aborted) return
        callbacks.current.onApply(pending.text, file)
        handled.current = id!
        localStorage.removeItem(reverseStorageKey('handoff'))
        const params = new URLSearchParams(search.toString())
        params.delete('reversePrompt')
        router.replace(`/workbench?${params}`)
      } catch (reason) {
        if (!controller.signal.aborted) {
          handled.current = id!
          callbacks.current.onError(reason instanceof Error ? reason.message : '反推描述读取失败')
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [ready, id, router, search])
}
