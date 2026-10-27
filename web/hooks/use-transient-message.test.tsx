// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTransientMessage } from './use-transient-message'

let root: Root
let host: HTMLDivElement

function Fixture() {
  const [message, showMessage] = useTransientMessage()
  return (
    <>
      <button onClick={() => showMessage('已保存')}>保存</button>
      <button onClick={() => showMessage('已删除')}>删除</button>
      <button onClick={() => showMessage('')}>清除</button>
      {message && <p role="status">{message}</p>}
    </>
  )
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<Fixture />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === label)!
  await act(async () => button.click())
}

async function advance(milliseconds: number) {
  await act(async () => vi.advanceTimersByTimeAsync(milliseconds))
}

it('shows a success message for four seconds, then removes the status', async () => {
  expect(host.querySelector('[role="status"]')).toBeNull()
  await click('保存')
  await advance(3999)
  expect(host.querySelector('[role="status"]')?.textContent).toBe('已保存')
  await advance(1)
  expect(host.querySelector('[role="status"]')).toBeNull()
})

it.each(['保存', '删除'])('restarts the timeout for a repeated %s action', async (action) => {
  await click('保存')
  await advance(3000)
  await click(action)
  await advance(1000)
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    action === '保存' ? '已保存' : '已删除',
  )
  await advance(3000)
  expect(host.querySelector('[role="status"]')).toBeNull()
})

it('clears immediately and gives a later action its own full timeout', async () => {
  await click('保存')
  await advance(3000)
  await click('清除')
  expect(host.querySelector('[role="status"]')).toBeNull()
  await click('保存')
  await advance(1000)
  expect(host.querySelector('[role="status"]')?.textContent).toBe('已保存')
  await advance(3000)
  expect(host.querySelector('[role="status"]')).toBeNull()
})

it('cancels pending dismissal when leaving the page', async () => {
  await click('保存')
  expect(vi.getTimerCount()).toBe(1)
  await act(async () => root.render(null))
  expect(vi.getTimerCount()).toBe(0)
  await act(async () => root.render(<Fixture />))
  expect(host.querySelector('[role="status"]')).toBeNull()
})
