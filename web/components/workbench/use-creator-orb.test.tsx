// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CreatorPanel } from './creator-panel'
import type { ConfigSide } from './shared'

let root: Root
let container: HTMLDivElement
let canvas: DOMRect
let resized: () => void
const docked = vi.fn()
function Harness({ side = 'left' }: { side?: ConfigSide }) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <section className={`workbench-shell ${collapsed ? 'creator-config-collapsed' : ''}`}>
      <CreatorPanel
        className="general-composer"
        side={side}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onSetSide={docked}
        onResetLayout={() => setCollapsed(false)}
        notice={null}
        isSubmitting={false}
        isGenerating={false}
      >
        <div id="creation-settings-body" hidden={collapsed}>
          <textarea defaultValue="保留草稿" />
        </div>
      </CreatorPanel>
      <div className="creation-canvas" />
      <button className="collapse" onClick={() => setCollapsed(true)}>
        收起
      </button>
    </section>
  )
}
const toggle = () => container.querySelector<HTMLButtonElement>('.creator-panel-toggle')!
const orb = () => container.querySelector<HTMLElement>('aside')!
const position = () => [
  Number.parseFloat(orb().style.getPropertyValue('--creator-orb-x')),
  Number.parseFloat(orb().style.getPropertyValue('--creator-orb-y')),
]
async function pointer(type: string, x: number, y: number) {
  await act(async () =>
    toggle().dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        bubbles: true,
      }),
    ),
  )
}
async function key(value: string, shiftKey = false) {
  await act(async () =>
    toggle().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        shiftKey,
        bubbles: true,
      }),
    ),
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId = 1
    },
  )
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  canvas = new DOMRect(248, 96, 936, 608)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('workbench-shell')) return new DOMRect(16, 16, 1168, 688)
    if (this.classList.contains('creation-canvas')) return canvas
    if (this.tagName === 'ASIDE')
      return new DOMRect(
        16 + (Number.parseFloat(this.style.getPropertyValue('--creator-orb-x')) || 0),
        16 + (Number.parseFloat(this.style.getPropertyValue('--creator-orb-y')) || 0),
        48,
        48,
      )
    return new DOMRect()
  })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => false },
  })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280, writable: true })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720, writable: true })
  docked.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
  Reflect.deleteProperty(HTMLElement.prototype, 'hasPointerCapture')
  vi.unstubAllGlobals()
})
it('tracks the grab offset, stays at release, and suppresses only the drag click', async () => {
  await act(async () => root.render(<Harness />))
  expect(position()).toEqual([240, 88])
  await pointer('pointerdown', 270, 120)
  await pointer('pointermove', 670, 420)
  expect(position()).toEqual([640, 388])
  expect(orb().dataset.orbDragging).toBe('true')
  await pointer('pointerup', 670, 420)
  await act(async () =>
    toggle().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })),
  )
  expect(toggle().getAttribute('aria-expanded')).toBe('false')
  expect(position()).toEqual([640, 388])
  expect(orb().dataset.orbDragging).toBeUndefined()
  expect(docked).not.toHaveBeenCalled()
  // The next deliberate click opens the editor and restores focus and draft.
  await pointer('pointerdown', 670, 420)
  await pointer('pointerup', 670, 420)
  await act(async () =>
    toggle().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })),
  )
  expect(toggle().getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(container.querySelector('textarea'))
  expect(container.querySelector('textarea')!.value).toBe('保留草稿')
  await act(async () => container.querySelector<HTMLButtonElement>('.collapse')!.click())
  expect(position()).toEqual([640, 388])
})
it('clamps to the visible content area, then keeps the orb reachable after a resize', async () => {
  await act(async () => root.render(<Harness />))
  await pointer('pointerdown', 270, 120)
  await pointer('pointermove', 3000, 2000)
  expect(position()).toEqual([1112, 632])
  await pointer('pointermove', -100, -100)
  expect(position()).toEqual([240, 88])
  await pointer('pointermove', 3000, 2000)
  await pointer('pointerup', 3000, 2000)
  canvas = new DOMRect(100, 96, 700, 400)
  await act(async () => resized())
  expect(position()).toEqual([728, 424])
  window.innerHeight = 360
  await act(async () => window.dispatchEvent(new Event('resize')))
  expect(position()[1]).toBe(288)
})
it.each(['Escape', 'pointercancel', 'lostpointercapture', 'blur'])(
  'restores the starting position on %s',
  async (cancel) => {
    await act(async () => root.render(<Harness />))
    await pointer('pointerdown', 270, 120)
    await pointer('pointermove', 670, 420)
    if (cancel === 'Escape') await key('Escape')
    else if (cancel === 'blur') await act(async () => window.dispatchEvent(new Event('blur')))
    else await pointer(cancel, 670, 420)
    expect(position()).toEqual([240, 88])
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(orb().dataset.orbDragging).toBeUndefined()
  },
)
it('allows a click with slight pointer movement and keyboard activation after dragging', async () => {
  await act(async () => root.render(<Harness />))
  await pointer('pointerdown', 270, 120)
  await pointer('pointermove', 273, 122)
  await pointer('pointerup', 273, 122)
  expect(position()).toEqual([240, 88])
  await act(async () => toggle().click())
  expect(toggle().getAttribute('aria-expanded')).toBe('true')
  await act(async () => container.querySelector<HTMLButtonElement>('.collapse')!.click())
  await pointer('pointerdown', 270, 120)
  await pointer('pointermove', 670, 420)
  await pointer('pointerup', 670, 420)
  await act(async () => toggle().click())
  expect(toggle().getAttribute('aria-expanded')).toBe('true')
})
it('supports keyboard positioning, right-side placement and resetting the floating location', async () => {
  await act(async () => root.render(<Harness side="right" />))
  expect(position()).toEqual([1112, 88])
  await key('ArrowLeft')
  await key('ArrowDown', true)
  expect(position()).toEqual([1096, 136])
  await key('Home')
  expect(position()).toEqual([1112, 88])
  await key('ArrowLeft')
  await act(async () => toggle().click())
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="恢复默认创作布局"]')!.click(),
  )
  await act(async () => container.querySelector<HTMLButtonElement>('.collapse')!.click())
  expect(position()).toEqual([1112, 88])
  expect(docked).not.toHaveBeenCalled()
})
