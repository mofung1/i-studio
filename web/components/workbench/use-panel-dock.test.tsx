// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePanelDock } from './use-panel-dock'
import type { ConfigSide } from './shared'

let root: Root
let container: HTMLDivElement
let desktop = true
const docked = vi.fn()
function Harness() {
  const [side, setSide] = useState<ConfigSide>('left')
  const dock = usePanelDock({
    enabled: true,
    collapsed: false,
    side,
    onDock: (value) => {
      docked(value)
      setSide(value)
    },
  })
  return (
    <section className="workbench-shell">
      <nav className="workbench-rail" />
      <header className="workbench-nav" />
      <aside ref={dock.panelRef} data-side={side}>
        <button {...dock.handleProps}>drag</button>
      </aside>
      <output>{dock.preview?.side ?? side}</output>
    </section>
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId = 1
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') || desktop,
  }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.className === 'workbench-shell') return new DOMRect(0, 0, 1200, 720)
    if (this.className === 'workbench-rail') return new DOMRect(0, 0, 200, 720)
    if (this.className === 'workbench-nav') return new DOMRect(216, 0, 984, 64)
    if (this.tagName === 'ASIDE')
      return new DOMRect(this.dataset.side === 'right' ? 860 : 216, 80, 340, 640)
    return new DOMRect()
  })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => false },
  })
  desktop = true
  docked.mockReset()
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
async function pointer(type: string, x: number) {
  await act(async () =>
    container
      .querySelector('button')!
      .dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: 100, button: 0, bubbles: true }),
      ),
  )
}
it('previews the target without docking until release, then docks right', async () => {
  await act(async () => root.render(<Harness />))
  await pointer('pointerdown', 225)
  await pointer('pointermove', 1000)
  expect(container.querySelector('output')?.textContent).toBe('right')
  expect(docked).not.toHaveBeenCalled()
  await pointer('pointerup', 1000)
  expect(docked).toHaveBeenCalledExactlyOnceWith('right')
  expect(container.querySelector('aside')?.style.transform).toBe('')
})
it('Escape cancels docking and a click never moves the panel', async () => {
  await act(async () => root.render(<Harness />))
  await pointer('pointerdown', 225)
  await pointer('pointermove', 1000)
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(container.querySelector('output')?.textContent).toBe('left')
  expect(docked).not.toHaveBeenCalled()
  await pointer('pointerdown', 225)
  await pointer('pointermove', 227)
  await pointer('pointerup', 227)
  expect(docked).not.toHaveBeenCalled()
})
it('supports keyboard docking while disabling pointer dragging on phones', async () => {
  await act(async () => root.render(<Harness />))
  await act(async () =>
    container
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
  )
  expect(docked).toHaveBeenCalledWith('right')
  docked.mockClear()
  desktop = false
  await pointer('pointerdown', 900)
  await pointer('pointermove', 220)
  await pointer('pointerup', 220)
  expect(docked).not.toHaveBeenCalled()
})
