// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useDialogFocus } from './use-dialog-focus'
function Dialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, close)
  return (
    <div ref={ref} role="dialog">
      <button>关闭</button>
    </div>
  )
}
it('only closes the top dialog and retains the scroll lock until all dialogs close', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const outer = vi.fn(),
    inner = vi.fn()
  document.body.style.overflow = 'auto'
  try {
    await act(async () =>
      root.render(
        <>
          <Dialog close={outer} />
          <Dialog close={inner} />
        </>,
      ),
    )
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    )
    expect(inner).toHaveBeenCalledOnce()
    expect(outer).not.toHaveBeenCalled()
    await act(async () => root.render(<Dialog close={outer} />))
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => root.unmount())
    expect(document.body.style.overflow).toBe('auto')
  } finally {
    container.remove()
    document.body.style.overflow = ''
    vi.unstubAllGlobals()
  }
})

it('skips hidden, inert and collapsed controls when trapping Tab', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Fields() {
    const ref = useRef<HTMLDivElement>(null)
    useDialogFocus(ref, () => {})
    return (
      <div ref={ref} role="dialog">
        <button id="first">关闭</button>
        <button id="last">保存</button>
        <section hidden>
          <button>隐藏区域</button>
        </section>
        <section style={{ display: 'none' }}>
          <button>隐藏样式</button>
        </section>
        <section inert>
          <button>不可交互</button>
        </section>
        <details>
          <summary>更多选项</summary>
          <button>折叠字段</button>
        </details>
        <button hidden>隐藏按钮</button>
      </div>
    )
  }
  try {
    await act(async () => root.render(<Fields />))
    const summary = host.querySelector('summary')!
    summary.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => summary.dispatchEvent(forward))
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(host.querySelector('#first'))
    const back = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => document.activeElement!.dispatchEvent(back))
    expect(document.activeElement).toBe(summary)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

it('leaves Escape to a native dialog above a custom dialog', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const close = vi.fn()
  try {
    await act(async () => root.render(<Dialog close={close} />))
    const native = document.createElement('dialog')
    native.open = true
    native.innerHTML = '<button>原生弹窗操作</button>'
    host.querySelector('[role="dialog"]')!.append(native)
    const control = native.querySelector('button')!
    control.focus()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    await act(async () => control.dispatchEvent(escape))
    expect(close).not.toHaveBeenCalled()
    expect(escape.defaultPrevented).toBe(false)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
