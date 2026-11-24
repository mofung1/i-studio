'use client'

import { useEffect, useRef, useState } from 'react'

import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'
import type { GenerationModel } from '@/lib/contracts'
import type { PublicImageModel } from '@/lib/generation-models'

interface UseModelCatalogOptions {
  initialModel?: string
  /** 草稿恢复完成后才请求能力列表 */
  ready: boolean
  /** 草稿恢复失败时不要覆盖用户当前的模型选择 */
  restorationFailed: boolean
  endpointId: string
  setEndpointId: (id: string) => void
  setModel: (model: GenerationModel) => void
}

/**
 * 工作台的模型目录：读取后端能力列表，并在列表就绪后对齐当前模型/端点选择。
 *
 * 这段逻辑同时服务于工作台初始化、历史配置回填和「模型不可用」提示，
 * 单独成 hook 避免和工作台主体逻辑混在一起。
 */
export function useModelCatalog({
  initialModel,
  ready,
  restorationFailed,
  endpointId,
  setEndpointId,
  setModel,
}: UseModelCatalogOptions) {
  const [imageEndpoints, setImageEndpoints] = useState<PublicImageModel[]>([])
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)
  const [promptEnhanceEnabled, setPromptEnhanceEnabled] = useState(false)
  const [promptVision, setPromptVision] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState('')
  const [modelsRevision, setModelsRevision] = useState(0)
  const selectedEndpointRef = useRef(endpointId)
  selectedEndpointRef.current = endpointId

  useEffect(() => {
    if (!ready) return
    let current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    setModelsLoading(true)
    setModelsError('')
    setAiEnabled(null)
    fetch(`${apiBaseUrl}/v1/generation/capabilities`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, '模型列表读取失败，请重试'))
        return response.json()
      })
      .then(
        (data: {
          aiEnabled?: boolean
          promptEnhanceEnabled?: boolean
          promptVision?: boolean
          imageEndpoints?: PublicImageModel[]
          creditName?: string
        }) => {
          if (!current) return
          const endpoints = (data.imageEndpoints ?? []).map((endpoint) => ({
            ...endpoint,
            creditName: data.creditName ?? '积分',
          }))
          setAiEnabled(Boolean(data.aiEnabled) && endpoints.length > 0)
          setPromptEnhanceEnabled(Boolean(data.promptEnhanceEnabled))
          setPromptVision(Boolean(data.promptVision))
          setImageEndpoints(endpoints)
          if (restorationFailed) return
          const selected = selectedEndpointRef.current
            ? endpoints.find((endpoint) => endpoint.id === selectedEndpointRef.current)
            : (endpoints.find(
                (endpoint) => endpoint.id === initialModel || endpoint.model === initialModel,
              ) ??
              endpoints.find((endpoint) => endpoint.isDefault) ??
              endpoints[0])
          if (selected) {
            setEndpointId(selected.id)
            setModel(selected.model)
          } else if (!selectedEndpointRef.current) {
            setEndpointId('')
            setModel('')
          }
        },
      )
      .catch((error) => {
        if (!current) return
        setAiEnabled(false)
        setImageEndpoints([])
        setModelsError(
          controller.signal.aborted
            ? '模型列表读取超时，请重试'
            : error instanceof Error
              ? error.message
              : '模型列表读取失败，请重试',
        )
      })
      .finally(() => {
        clearTimeout(timeout)
        if (current) setModelsLoading(false)
      })
    return () => {
      current = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [modelsRevision, initialModel, ready, restorationFailed, setEndpointId, setModel])

  /** 选择端点时同步底层模型标识 */
  function selectEndpoint(id: string) {
    setEndpointId(id)
    const selected = imageEndpoints.find((endpoint) => endpoint.id === id)
    if (selected) setModel(selected.model)
  }

  return {
    imageEndpoints,
    aiEnabled,
    promptEnhanceEnabled,
    promptVision,
    modelsLoading,
    modelsError,
    reloadModels: () => setModelsRevision((value) => value + 1),
    selectEndpoint,
  }
}
