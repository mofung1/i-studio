// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useErrorNotification, safeAsync, safeSync } from './error-handling'

describe('useErrorNotification', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div')
    root = createRoot(host)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    act(() => root.unmount())
  })

  it('should initialize with null notice', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | null = null

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    expect(hookResult?.notice).toBeNull()
  })

  it('should handle Error instance', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | null = null
    const error = new Error('Something went wrong')

    function Fixture() {
      hookResult = useErrorNotification('[Test]')
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => hookResult?.handleError(error, 'Fallback message'))

    expect(hookResult?.notice).toEqual({
      kind: 'error',
      message: 'Something went wrong',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Test]', error)
  })

  it('should handle string error', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.handleError('String error', 'Fallback message')
    })

    expect(hookResult?.notice).toEqual({
      kind: 'error',
      message: 'String error',
    })
  })

  it('should use fallback message for unknown error', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.handleError({ unknown: true }, 'Fallback message')
    })

    expect(hookResult?.notice).toEqual({
      kind: 'error',
      message: 'Fallback message',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith('[App Error]', 'Unknown error:', { unknown: true })
  })

  it('should support custom notice kind', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.handleError(new Error('Warning!'), 'Fallback', { kind: 'warning' })
    })

    expect(hookResult?.notice?.kind).toBe('warning')
  })

  it('should support disabling log', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.handleError(new Error('Silent'), 'Fallback', { log: false })
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should clear notice', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.handleError(new Error('Test'), 'Fallback')
    })
    expect(hookResult?.notice).not.toBeNull()

    act(() => {
      if (hookResult) hookResult.clearNotice()
    })
    expect(hookResult?.notice).toBeNull()
  })

  it('should show success notice', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.showSuccess('操作成功')
    })

    expect(hookResult?.notice).toEqual({
      kind: 'success',
      message: '操作成功',
    })
  })

  it('should show warning notice', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.showWarning('警告信息')
    })

    expect(hookResult?.notice).toEqual({
      kind: 'warning',
      message: '警告信息',
    })
  })

  it('should show info notice', () => {
    let hookResult: ReturnType<typeof useErrorNotification> | undefined

    function Fixture() {
      hookResult = useErrorNotification()
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.showInfo('提示信息')
    })

    expect(hookResult?.notice).toEqual({
      kind: 'info',
      message: '提示信息',
    })
  })
})

describe('safeAsync', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('should return result on success', async () => {
    const result = await safeAsync(async () => 'success', '[Test]')
    expect(result).toBe('success')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should return null and log on error', async () => {
    const error = new Error('Async error')
    const result = await safeAsync(
      async () => {
        throw error
      },
      '[Test] Operation failed',
    )

    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Test] Operation failed', error)
  })
})

describe('safeSync', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('should return result on success', () => {
    const result = safeSync(() => 42, '[Test]')
    expect(result).toBe(42)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should return null and log on error', () => {
    const error = new Error('Sync error')
    const result = safeSync(() => {
      throw error
    }, '[Test] Operation failed')

    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Test] Operation failed', error)
  })
})
