'use client'

import { useEffect, useState } from 'react'

import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import type { PublicImageModel } from '@/lib/generation-models'

interface CanvasCapabilities {
  imageEndpoints: PublicImageModel[]
  promptEnhanceEnabled: boolean
  /** 文本模型是否支持识图（决定图生文连线是否可用） */
  promptVision: boolean
  loading: boolean
  error: string
}

/**
 * 画布共享的能力列表：图像模型端点 + 文生文（提示词优化）开关。
 * 整个画布只请求一次，分发给各个节点卡片使用。
 */
export function useCanvasCapabilities(): CanvasCapabilities {
  const [imageEndpoints, setImageEndpoints] = useState<PublicImageModel[]>([])
  const [promptEnhanceEnabled, setPromptEnhanceEnabled] = useState(false)
  const [promptVision, setPromptVision] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    setLoading(true)
    setError('')
    fetch(`${apiBaseUrl}/v1/generation/capabilities`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, '能力列表读取失败，请重试'))
        return response.json() as {
          promptEnhanceEnabled?: boolean
          promptVision?: boolean
          imageEndpoints?: PublicImageModel[]
        }
      })
      .then((data) => {
        if (!current) return
        setPromptEnhanceEnabled(Boolean(data.promptEnhanceEnabled))
        setPromptVision(Boolean(data.promptVision))
        setImageEndpoints(data.imageEndpoints ?? [])
      })
      .catch((reason) => {
        if (!current) return
        setError(
          controller.signal.aborted
            ? '能力列表读取超时，请重试'
            : reason instanceof Error
              ? reason.message
              : '能力列表读取失败，请重试',
        )
      })
      .finally(() => {
        clearTimeout(timeout)
        if (current) setLoading(false)
      })
    return () => {
      current = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  return { imageEndpoints, promptEnhanceEnabled, promptVision, loading, error }
}
