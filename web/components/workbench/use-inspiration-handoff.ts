'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  applyInspirationVariables,
  readInspirationTemplate,
  type InspirationTemplate,
} from '@/lib/inspiration-handoff'
import { promptVariables } from '@/lib/personal-prompts'

export function useInspirationHandoff({
  ready,
  onApply,
}: {
  ready: boolean
  onApply: (template: InspirationTemplate) => void | Promise<void>
}) {
  const search = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const id = search.get('inspirationId')
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<InspirationTemplate | null>(null)
  const request = useRef(0)
  const applied = useRef('')
  const current = useRef({ id, search, pathname, onApply })
  current.current = { id, search, pathname, onApply }

  function consume(templateId: string) {
    if (current.current.id !== templateId) return
    const query = new URLSearchParams(current.current.search.toString())
    query.delete('inspirationId')
    const suffix = query.toString()
    router.replace(`${current.current.pathname}${suffix ? `?${suffix}` : ''}`, { scroll: false })
  }

  async function apply(template: InspirationTemplate, version: number) {
    if (version !== request.current || current.current.id !== template.id) return
    // The owner can await its draft write before the one-time URL handoff is consumed.
    await current.current.onApply(template)
    if (version !== request.current || current.current.id !== template.id) return
    applied.current = template.id
    setPending(null)
    setError('')
    consume(template.id)
  }

  useEffect(() => {
    const version = ++request.current
    setPending(null)
    setError('')
    setLoading(false)
    if (!id) {
      applied.current = ''
      return
    }
    if (!ready || applied.current === id) return
    const controller = new AbortController()
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 10000)
    setLoading(true)
    void readInspirationTemplate(id, controller.signal)
      .then(async (template) => {
        if (controller.signal.aborted || version !== request.current) return
        if (promptVariables(template.prompt).length) setPending(template)
        else await apply(template, version)
      })
      .catch((reason) => {
        if (version !== request.current || (controller.signal.aborted && !timedOut)) return
        setError(
          timedOut
            ? '灵感模板读取超时，请重试'
            : reason instanceof Error
              ? reason.message
              : '灵感模板读取失败，请重试',
        )
      })
      .finally(() => {
        window.clearTimeout(timeout)
        if (version === request.current) setLoading(false)
      })
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
      if (request.current === version) request.current++
    }
    // Callbacks and the current URL are read through refs, so typing cannot restart the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready, attempt])

  return {
    loading,
    error,
    pending,
    retry: () => setAttempt((value) => value + 1),
    dismiss: () => {
      request.current++
      setPending(null)
      setLoading(false)
      setError('')
      if (id) consume(id)
    },
    applyVariables: async (values: Record<string, string>) => {
      if (!pending || current.current.id !== pending.id) return
      await apply(applyInspirationVariables(pending, values), request.current)
    },
  }
}
