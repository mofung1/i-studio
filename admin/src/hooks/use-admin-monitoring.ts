import { useCallback, useEffect, useRef, useState } from 'react'
import { adminRequest, type OperationalMonitoring } from '@/lib/admin'

export const monitoringDuration = (seconds: number) =>
  seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`

export function useAdminMonitoring() {
  const [data, setData] = useState<OperationalMonitoring | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    const timeout = window.setTimeout(() => request.abort(), 10000)
    request.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true })
    try {
      const result = await adminRequest<OperationalMonitoring>(
        'monitoring',
        'GET',
        undefined,
        request.signal,
      )
      if (!request.signal.aborted) {
        setData(result)
        setError('')
      }
    } catch (cause) {
      if (controller.current === request)
        setError(
          cause instanceof TypeError
            ? '无法连接监控服务，请检查 API 或网络后重试'
            : cause instanceof Error && cause.name !== 'AbortError'
              ? cause.message
              : '监控请求超时，请刷新重试',
        )
    } finally {
      window.clearTimeout(timeout)
      if (controller.current === request) {
        controller.current = null
        setLoading(false)
      }
    }
  }, [])
  useEffect(() => {
    void refresh()
    const updateWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const interval = window.setInterval(updateWhenVisible, 30000)
    document.addEventListener('visibilitychange', updateWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', updateWhenVisible)
      const pending = controller.current
      controller.current = null
      pending?.abort()
    }
  }, [refresh])
  return { data, error, loading, refresh }
}
