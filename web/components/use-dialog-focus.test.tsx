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
