// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { StudioToolLauncher } from './studio-tool-launcher'

const state = vi.hoisted(() => ({ query: new URLSearchParams(), openReverse: vi.fn() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => state.query }))
vi.mock('@/components/prompt-reverse-provider', () => ({
  usePromptReverse: () => ({ openReverse: state.openReverse }),
}))
afterEach(() => {
  vi.unstubAllGlobals()
  state.openReverse.mockClear()
})

it('opens the existing reverse dialog once per visit, and leaves other tools alone', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const root = createRoot(document.createElement('div'))
  state.query = new URLSearchParams('tool=image-to-prompt')
  await act(async () => root.render(<StudioToolLauncher />))
  await act(async () => root.render(<StudioToolLauncher />))
  expect(state.openReverse).toHaveBeenCalledTimes(1)
  state.query = new URLSearchParams('mode=commerce&task=product-main')
  await act(async () => root.render(<StudioToolLauncher />))
  expect(state.openReverse).toHaveBeenCalledTimes(1)
  state.query = new URLSearchParams('tool=image-to-prompt')
  await act(async () => root.render(<StudioToolLauncher />))
  expect(state.openReverse).toHaveBeenCalledTimes(2)
  await act(async () => root.unmount())
})
