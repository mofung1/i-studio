// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { WorkbenchMode } from './shared'
import {
  COMMERCE_LAYOUT_KEY,
  CREATOR_LAYOUT_KEY,
  useCreatorPreferences,
} from './use-creator-preferences'
let root: Root
let container: HTMLDivElement
function Harness({ scope = 'general' }: { scope?: WorkbenchMode }) {
  const layout = useCreatorPreferences(scope)
  return (
    <>
      <output>
        {layout.side}:{String(layout.collapsed)}
      </output>
      <button onClick={() => layout.setCollapsed(!layout.collapsed)}>toggle</button>
      <button onClick={() => layout.setSide('right')}>right</button>
      <button onClick={layout.reset}>reset</button>
    </>
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})
it('restores docking and collapse independently of commerce layout, then resets both', async () => {
  localStorage.setItem(CREATOR_LAYOUT_KEY, JSON.stringify({ side: 'right', collapsed: true }))
  localStorage.setItem('istudio-config-side', 'right')
  await act(async () => root.render(<Harness />))
  expect(container.querySelector('output')?.textContent).toBe('right:true')
  await act(async () => container.querySelectorAll('button')[2]!.click())
  expect(container.querySelector('output')?.textContent).toBe('left:false')
  expect(JSON.parse(localStorage.getItem(CREATOR_LAYOUT_KEY)!)).toEqual({
    side: 'left',
    collapsed: false,
  })
  expect(localStorage.getItem('istudio-config-side')).toBe('right')
})
it('recovers from malformed preferences and remembers subsequent choices', async () => {
  localStorage.setItem(CREATOR_LAYOUT_KEY, 'broken json')
  await act(async () => root.render(<Harness />))
  expect(container.querySelector('output')?.textContent).toBe('left:false')
  await act(async () => container.querySelectorAll('button')[0]!.click())
  await act(async () => container.querySelectorAll('button')[1]!.click())
  expect(JSON.parse(localStorage.getItem(CREATOR_LAYOUT_KEY)!)).toEqual({
    side: 'right',
    collapsed: true,
  })
})

it('keeps desktop collapse preferences while showing the full editor on phones', async () => {
  let change = () => {}
  const media = {
    matches: true,
    addEventListener: (_type: string, callback: () => void) => {
      change = callback
    },
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', () => media)
  localStorage.setItem(CREATOR_LAYOUT_KEY, JSON.stringify({ side: 'right', collapsed: true }))
  await act(async () => root.render(<Harness />))
  expect(container.querySelector('output')?.textContent).toBe('right:true')
  await act(async () => {
    media.matches = false
    change()
  })
  expect(container.querySelector('output')?.textContent).toBe('right:false')
  expect(JSON.parse(localStorage.getItem(CREATOR_LAYOUT_KEY)!).collapsed).toBe(true)
  await act(async () => {
    media.matches = true
    change()
  })
  expect(container.querySelector('output')?.textContent).toBe('right:true')
})

it('migrates the commerce docking preference and shares it across commerce tools', async () => {
  localStorage.setItem('istudio-config-side', 'right')
  await act(async () => root.render(<Harness scope="commerce" />))
  expect(container.querySelector('output')?.textContent).toBe('right:false')
  await act(async () => container.querySelectorAll('button')[0]!.click())
  expect(JSON.parse(localStorage.getItem(COMMERCE_LAYOUT_KEY)!)).toEqual({
    side: 'right',
    collapsed: true,
  })
  await act(async () => root.render(null))
  await act(async () => root.render(<Harness scope="commerce" />))
  expect(container.querySelector('output')?.textContent).toBe('right:true')
})

it('switches scopes without overwriting either workspace preference', async () => {
  localStorage.setItem(COMMERCE_LAYOUT_KEY, JSON.stringify({ side: 'right', collapsed: true }))
  await act(async () => root.render(<Harness />))
  expect(container.querySelector('output')?.textContent).toBe('left:false')
  await act(async () => root.render(<Harness scope="commerce" />))
  expect(container.querySelector('output')?.textContent).toBe('right:true')
  expect(JSON.parse(localStorage.getItem(CREATOR_LAYOUT_KEY)!)).toEqual({
    side: 'left',
    collapsed: false,
  })
  await act(async () => root.render(<Harness />))
  expect(container.querySelector('output')?.textContent).toBe('left:false')
  expect(JSON.parse(localStorage.getItem(COMMERCE_LAYOUT_KEY)!)).toEqual({
    side: 'right',
    collapsed: true,
  })
})
