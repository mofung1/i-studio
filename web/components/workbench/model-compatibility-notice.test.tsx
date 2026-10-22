// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ModelCompatibilityNotice } from './model-compatibility-notice'

it('requires an explicit action to adjust parameters and keeps an incompatible reference warning', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  const onApply = vi.fn()
  const model = {
    id: 'a',
    model: 'a',
    name: 'A',
    capabilities: { referenceImages: false, aspectRatios: ['3:4'], resolutions: ['1K'] },
  }
  try {
    await act(async () =>
      root.render(
        <ModelCompatibilityNotice
          model={model}
          parameters={{ aspectRatio: '16:9', resolution: '4K', hasImages: true }}
          onApply={onApply}
        />,
      ),
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('已保留原配置和素材')
    expect(onApply).not.toHaveBeenCalled()
    await act(async () => container.querySelector('button')!.click())
    expect(onApply).toHaveBeenCalledWith({ aspectRatio: '3:4', resolution: '1K' })
    await act(async () =>
      root.render(
        <ModelCompatibilityNotice
          model={model}
          parameters={{ aspectRatio: '3:4', resolution: '1K', hasImages: true }}
          onApply={onApply}
        />,
      ),
    )
    expect(container.textContent).toContain('参考图片')
    expect(container.querySelector('button')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
