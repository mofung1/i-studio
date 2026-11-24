// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi, describe } from 'vitest'
import { useWorkbenchConfig } from './use-workbench-config'

describe('useWorkbenchConfig', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div')
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  it('should initialize with default values', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'general',
        initialTask: 'product-main',
      })
      return null
    }

    act(() => root.render(<Fixture />))

    expect(hookResult?.config.mode).toBe('general')
    expect(hookResult?.config.task).toBe('product-main')
    expect(hookResult?.config.prompt).toBe('')
    expect(hookResult?.config.count).toBe(1)
    expect(hookResult?.config.aspectRatio).toBe('1:1')
  })

  it('should initialize with custom values', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'commerce',
        initialTask: 'detail-page',
        initialPrompt: '测试提示词',
        initialCount: '4',
        initialAspectRatio: '16:9',
      })
      return null
    }

    act(() => root.render(<Fixture />))

    expect(hookResult?.config.prompt).toBe('测试提示词')
    expect(hookResult?.config.count).toBe(4)
    expect(hookResult?.config.aspectRatio).toBe('16:9')
  })

  it('should update single field', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'general',
        initialTask: 'product-main',
      })
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.updateConfig({ prompt: '新提示词' })
    })

    expect(hookResult?.config.prompt).toBe('新提示词')
    expect(hookResult?.config.mode).toBe('general') // 其他字段不变
  })

  it('should update multiple fields', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'general',
        initialTask: 'product-main',
      })
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) {
        hookResult.updateConfig({
          prompt: '新提示词',
          count: 3,
          aspectRatio: '4:3',
        })
      }
    })

    expect(hookResult?.config.prompt).toBe('新提示词')
    expect(hookResult?.config.count).toBe(3)
    expect(hookResult?.config.aspectRatio).toBe('4:3')
  })

  it('should reset to initial values', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'general',
        initialTask: 'product-main',
        initialPrompt: '初始提示词',
      })
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) {
        hookResult.updateConfig({
          prompt: '修改后的提示词',
          count: 5,
        })
      }
    })

    expect(hookResult?.config.prompt).toBe('修改后的提示词')
    expect(hookResult?.config.count).toBe(5)

    act(() => {
      if (hookResult) hookResult.resetConfig()
    })

    expect(hookResult?.config.prompt).toBe('初始提示词')
    expect(hookResult?.config.count).toBe(1)
  })

  it('should use legacy setters', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'general',
        initialTask: 'product-main',
      })
      return null
    }

    act(() => root.render(<Fixture />))
    act(() => {
      if (hookResult) hookResult.setPrompt('通过 setter 设置')
    })

    expect(hookResult?.config.prompt).toBe('通过 setter 设置')
  })

  it('should handle recipe configuration', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'commerce',
        initialTask: 'product-main',
        recipeRequirements: 'Recipe 要求',
        recipeAspectRatio: '21:9',
        recipeModuleCounts: { main: 2, detail: 1 },
        recipeModuleMode: 'custom',
      })
      return null
    }

    act(() => root.render(<Fixture />))

    expect(hookResult?.config.requirements).toBe('Recipe 要求')
    expect(hookResult?.config.aspectRatio).toBe('21:9')
    expect(hookResult?.config.moduleCounts).toEqual({ main: 2, detail: 1 })
    expect(hookResult?.config.moduleMode).toBe('custom')
  })

  it('should memoize config object', () => {
    let hookResult: ReturnType<typeof useWorkbenchConfig> | undefined
    let renderCount = 0

    function Fixture() {
      hookResult = useWorkbenchConfig({
        initialMode: 'general',
        initialTask: 'product-main',
      })
      renderCount++
      return null
    }

    act(() => root.render(<Fixture />))
    const firstConfig = hookResult?.config

    act(() => root.render(<Fixture />))
    const secondConfig = hookResult?.config

    // config 对象应该保持引用稳定（如果状态没变化）
    expect(renderCount).toBeGreaterThan(1)
    expect(secondConfig).toBe(firstConfig)
  })
})
