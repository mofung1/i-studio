'use client'

import { useEffect, useState } from 'react'

import { apiBaseUrl } from '@/lib/api'

/**
 * AI 服务可用性。null 表示还在探测 —— 探测完成前不允许提交，
 * 避免在没有供应商密钥时创建永久等待的任务。
 */
export function useAiEnabled() {
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/v1/generation/capabilities`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('capabilities unavailable'))))
      .then((data: { aiEnabled?: boolean }) => setAiEnabled(Boolean(data.aiEnabled)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setAiEnabled(false)
      })
    return () => controller.abort()
  }, [])

  return aiEnabled
}
