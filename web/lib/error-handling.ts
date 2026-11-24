import { useCallback, useState } from 'react'

/**
 * 通知类型
 */
export type NoticeKind = 'info' | 'success' | 'warning' | 'error'

/**
 * 通知消息结构
 */
export interface Notice {
  kind: NoticeKind
  message: string
}

/**
 * 错误日志配置
 */
interface ErrorLogConfig {
  enabled: boolean
  prefix: string
}

const defaultLogConfig: ErrorLogConfig = {
  enabled: true,
  prefix: '[App Error]',
}

/**
 * 统一错误处理 Hook
 *
 * 提供错误处理、通知显示和日志记录功能
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { notice, handleError, setNotice, clearNotice } = useErrorNotification('[MyComponent]')
 *
 *   async function doSomething() {
 *     try {
 *       await riskyOperation()
 *     } catch (error) {
 *       handleError(error, '操作失败，请稍后重试')
 *     }
 *   }
 *
 *   return (
 *     <>
 *       {notice && <div className={notice.kind}>{notice.message}</div>}
 *       <button onClick={doSomething}>执行操作</button>
 *     </>
 *   )
 * }
 * ```
 */
export function useErrorNotification(logPrefix?: string) {
  const [notice, setNotice] = useState<Notice | null>(null)

  const logConfig: ErrorLogConfig = {
    ...defaultLogConfig,
    prefix: logPrefix || defaultLogConfig.prefix,
  }

  /**
   * 处理错误并显示通知
   *
   * @param error - 捕获的错误对象
   * @param fallbackMessage - 当错误无法解析时的降级提示
   * @param options - 可选配置
   */
  const handleError = useCallback(
    (
      error: unknown,
      fallbackMessage: string,
      options?: {
        /** 是否记录日志，默认 true */
        log?: boolean
        /** 自定义通知类型，默认 'error' */
        kind?: NoticeKind
      },
    ) => {
      const shouldLog = options?.log !== false
      const kind = options?.kind || 'error'

      // 解析错误消息
      let message: string
      if (error instanceof Error) {
        message = error.message
        if (shouldLog && logConfig.enabled) {
          console.error(logConfig.prefix, error)
        }
      } else if (typeof error === 'string') {
        message = error
        if (shouldLog && logConfig.enabled) {
          console.error(logConfig.prefix, error)
        }
      } else {
        message = fallbackMessage
        if (shouldLog && logConfig.enabled) {
          console.error(logConfig.prefix, 'Unknown error:', error)
        }
      }

      // 设置通知
      setNotice({ kind, message })
    },
    [logConfig.enabled, logConfig.prefix],
  )

  /**
   * 清除当前通知
   */
  const clearNotice = useCallback(() => {
    setNotice(null)
  }, [])

  /**
   * 显示成功通知
   */
  const showSuccess = useCallback((message: string) => {
    setNotice({ kind: 'success', message })
  }, [])

  /**
   * 显示警告通知
   */
  const showWarning = useCallback((message: string) => {
    setNotice({ kind: 'warning', message })
  }, [])

  /**
   * 显示信息通知
   */
  const showInfo = useCallback((message: string) => {
    setNotice({ kind: 'info', message })
  }, [])

  return {
    notice,
    setNotice,
    clearNotice,
    handleError,
    showSuccess,
    showWarning,
    showInfo,
  }
}

/**
 * 安全执行异步操作的工具函数
 *
 * 捕获错误但不静默，始终记录日志
 *
 * @example
 * ```ts
 * await safeAsync(
 *   () => draft.flush(),
 *   '[Draft] 自动保存失败'
 * )
 * ```
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  logMessage: string,
): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    console.error(logMessage, error)
    return null
  }
}

/**
 * 安全执行同步操作的工具函数
 *
 * @example
 * ```ts
 * const result = safeSync(
 *   () => JSON.parse(data),
 *   '[Parser] JSON 解析失败'
 * )
 * ```
 */
export function safeSync<T>(operation: () => T, logMessage: string): T | null {
  try {
    return operation()
  } catch (error) {
    console.error(logMessage, error)
    return null
  }
}
