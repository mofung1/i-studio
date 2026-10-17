// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

let host: HTMLDivElement
let root: Root
let documentKeyListener: ((event: KeyboardEvent) => void) | null = null
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  if (documentKeyListener) document.removeEventListener('keydown', documentKeyListener)
  documentKeyListener = null
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const options = (
  <SelectGroup>
    <SelectItem value="a">全部作品</SelectItem>
    <SelectItem value="b">收藏作品</SelectItem>
  </SelectGroup>
)
function trigger() {
  return host.querySelector<HTMLButtonElement>('[role="combobox"]')!
}
async function key(element: Element, value: string) {
  await act(async () =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
    ),
  )
}

describe('shared select in editing dialogs', () => {
  it('keeps its menu inside the parent dialog and closes only the menu on Escape', async () => {
    const closeParent = vi.fn()
    documentKeyListener = (event) => {
      if (event.key === 'Escape') closeParent()
    }
    document.addEventListener('keydown', documentKeyListener)
    await act(async () =>
      root.render(
        <div
          role="dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeParent()
          }}
        >
          <Select defaultValue="a">
            <SelectTrigger aria-label="作品分类">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{options}</SelectContent>
          </Select>
        </div>,
      ),
    )
    await key(trigger(), 'ArrowDown')
    const menu = document.querySelector('[role="listbox"]')!
    expect(menu.closest('[role="dialog"]')).toBe(host.querySelector('[role="dialog"]'))
    await key(menu, 'Escape')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(closeParent).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger())
  })

  it('portals into a native dialog and preserves selecting a different value', async () => {
    const changed = vi.fn()
    await act(async () =>
      root.render(
        <dialog open>
          <Select defaultValue="a" onValueChange={changed}>
            <SelectTrigger aria-label="作品分类">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{options}</SelectContent>
          </Select>
        </dialog>,
      ),
    )
    await key(trigger(), 'ArrowDown')
    const menu = document.querySelector('[role="listbox"]')!
    expect(menu.closest('dialog')).toBe(host.querySelector('dialog'))
    const option = menu.querySelector<HTMLElement>('[role="option"][data-state="unchecked"]')!
    await act(async () => option.click())
    expect(changed).toHaveBeenCalledWith('b')
    expect(trigger().textContent).toContain('收藏作品')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('honors controlled open state when Escape requests closing', async () => {
    const changed = vi.fn()
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <Select
          open={open}
          onOpenChange={(value) => {
            changed(value)
            setOpen(value)
          }}
          defaultValue="a"
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{options}</SelectContent>
        </Select>
      )
    }
    await act(async () => root.render(<Controlled />))
    await key(trigger(), 'ArrowDown')
    await key(document.querySelector('[role="listbox"]')!, 'Escape')
    expect(changed.mock.calls.map((call) => call[0])).toEqual([true, false])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('keeps keyboard navigation and selection working through a long list', async () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    await act(async () =>
      root.render(
        <Select defaultValue="0" onValueChange={changed}>
          <SelectTrigger aria-label="目标平台">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 20 }, (_, index) => (
              <SelectItem key={index} value={String(index)}>
                平台 {index + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      ),
    )
    await key(trigger(), 'ArrowDown')
    await key(document.querySelector('[role="listbox"]')!, 'End')
    await act(async () => vi.runOnlyPendingTimers())
    expect(document.activeElement?.textContent).toBe('平台 20')
    await key(document.activeElement!, 'Enter')
    await act(async () => vi.runOnlyPendingTimers())
    expect(changed).toHaveBeenCalledExactlyOnceWith('19')
    expect(trigger().textContent).toContain('平台 20')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })
})
