// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ModelGuidance } from './model-guidance'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('reads arbitrary model metadata, updates it and resets the disclosure when switching models', async () => {
  const model = {
    id: 'new-a',
    name: '未来模型',
    model: 'a',
    usageHint: '<b>实测建议</b>',
    priceMinor: 125,
    creditName: '创作点',
    capabilities: { referenceImages: true, aspectRatios: ['3:4'], resolutions: ['2K'] },
  }
  await act(async () => root.render(<ModelGuidance model={model} />))
  expect(container.textContent).toContain('<b>实测建议</b>')
  expect(container.querySelector('b')).toBeNull()
  expect(container.textContent).toContain('1.25 创作点/张')
  expect(container.textContent).toContain('3:4')
  container.querySelector('details')!.open = true
  await act(async () =>
    root.render(
      <ModelGuidance
        model={{
          ...model,
          id: 'new-b',
          usageHint: '',
          priceMinor: 0,
          capabilities: { referenceImages: false, aspectRatios: ['1:1'], resolutions: ['1K'] },
        }}
      />,
    ),
  )
  expect(container.querySelector('.model-usage-hint')).toBeNull()
  expect(container.querySelector('details')!.open).toBe(false)
  expect(container.textContent).toContain('仅文字输入')
  expect(container.textContent).toContain('0 创作点/张')
  expect(container.textContent).not.toContain('3:4')
  await act(async () => root.render(<ModelGuidance />))
  expect(container.innerHTML).toBe('')
})
it('supports older API models without inventing capabilities, pricing or suggestions', async () => {
  await act(async () =>
    root.render(<ModelGuidance model={{ id: 'old', name: '旧模型', model: 'old' }} />),
  )
  expect(container.innerHTML).toBe('')
})
