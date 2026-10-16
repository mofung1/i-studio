// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OverlayRoot } from './overlay-root'
import { InfoDialog } from './info-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { LibrarySelect } from './library-controls'

let container: HTMLDivElement
let root: Root
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
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  vi.unstubAllGlobals()
})

it('keeps admin dialogs and dropdown menus inside the admin style scope', async () => {
  await act(async () =>
    root.render(
      <OverlayRoot className="admin-shell">
        <InfoDialog title="存储配置" onClose={() => {}} hideActions>
          <LibrarySelect
            label="存储平台"
            value="s3"
            onChange={() => {}}
            options={[
              ['s3', 'S3'],
              ['oss', 'OSS'],
            ]}
          />
        </InfoDialog>
      </OverlayRoot>,
    ),
  )
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.closest('.admin-shell')).toBe(container.firstElementChild)
  expect(document.activeElement).toBe(dialog.querySelector('button[aria-label="关闭"]'))
  const trigger = dialog.querySelector('[role="combobox"]')!
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  const menu = document.querySelector('[role="listbox"]')!
  expect(menu.closest('[role="dialog"]')).toBe(dialog)
  expect(menu.closest('.admin-shell')).toBe(container.firstElementChild)
})

it('inherits the workspace scope for confirmations and preserves body portals on frontend pages', async () => {
  const confirmation = (
    <ConfirmDialog
      title="删除提示词"
      description="确认删除"
      confirmLabel="删除"
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  )
  await act(async () =>
    root.render(<OverlayRoot className="admin-shell">{confirmation}</OverlayRoot>),
  )
  expect(document.querySelector('[role="dialog"]')?.closest('.admin-shell')).toBe(
    container.firstElementChild,
  )
  await act(async () => root.render(confirmation))
  expect(document.querySelector('.dialog-backdrop')?.parentElement).toBe(document.body)
})
