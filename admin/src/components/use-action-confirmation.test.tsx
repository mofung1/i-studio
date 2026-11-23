// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useActionConfirmation } from './use-action-confirmation'
import { Dialog, DialogContent, DialogTitle } from './admin/ui/dialog'
let root: Root, host: HTMLDivElement
const action = vi.fn()
let session = 'admin-one'
function Fixture() {
  const { ask, confirmation } = useActionConfirmation(() => session)
  return (
    <>
      <button
        onClick={async () => {
          if (
            await ask({
              title: '确认操作',
              description: '这项操作会产生实际影响。',
              confirmLabel: '确认执行',
              intent: 'warning',
            })
          )
            action()
        }}
      >
        开始操作
      </button>
      {confirmation}
    </>
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  action.mockReset()
  session = 'admin-one'
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function click(text: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === text,
  )!
  await act(async () => {
    b.focus()
    b.click()
  })
}
it('runs only after explicit custom confirmation and cancels without action', async () => {
  await act(async () => root.render(<Fixture />))
  await click('开始操作')
  expect(action).not.toHaveBeenCalled()
  await click('取消')
  expect(action).not.toHaveBeenCalled()
  await click('开始操作')
  await click('确认执行')
  expect(action).toHaveBeenCalledOnce()
})
it('cancels with Escape and returns focus to the trigger', async () => {
  await act(async () => root.render(<Fixture />))
  await click('开始操作')
  expect(document.activeElement?.textContent).toBe('取消')
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('button'))
  expect(action).not.toHaveBeenCalled()
})
it('does not execute a pending operation after its account changes or owner unmounts', async () => {
  await act(async () => root.render(<Fixture />))
  await click('开始操作')
  session = 'admin-two'
  await click('确认执行')
  expect(action).not.toHaveBeenCalled()
  await click('开始操作')
  await act(async () => root.render(<div />))
  expect(action).not.toHaveBeenCalled()
})

it('closes only the nested confirmation and restores focus inside the editor', async () => {
  await act(async () =>
    root.render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>编辑模型</DialogTitle>
          <Fixture />
        </DialogContent>
      </Dialog>,
    ),
  )
  await click('开始操作')
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)))
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(document.activeElement?.textContent).toBe('开始操作')
  expect(action).not.toHaveBeenCalled()
})
