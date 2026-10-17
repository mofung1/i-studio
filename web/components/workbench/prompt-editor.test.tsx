// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PromptEditor } from './prompt-editor'
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
it('keeps the draft after an AI failure and supports a successful retry and undo', async () => {
  const enhance = vi
    .fn()
    .mockRejectedValueOnce(new Error('AI 响应超时，原文已保留'))
    .mockResolvedValueOnce('优化后的商品摄影')
  function Editor() {
    const [value, setValue] = useState('原始描述')
    return (
      <PromptEditor
        value={value}
        onChange={setValue}
        enhance={enhance}
        ariaLabel="画面描述"
        placeholder="描述"
      />
    )
  }
  await act(async () => root.render(<Editor />))
  const click = (text: string) =>
    [...container.querySelectorAll('button')].find((button) => button.textContent === text)!.click()
  await act(async () => click('AI 优化提示词'))
  expect(container.querySelector('textarea')?.value).toBe('原始描述')
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('AI 响应超时')
  await act(async () => click('重试'))
  expect(container.querySelector('textarea')?.value).toBe('优化后的商品摄影')
  await act(async () => click('撤销'))
  expect(container.querySelector('textarea')?.value).toBe('原始描述')
})
it('rejects an over-limit draft before making an AI request', async () => {
  const enhance = vi.fn()
  await act(async () =>
    root.render(
      <PromptEditor
        value={'字'.repeat(10001)}
        onChange={vi.fn()}
        enhance={enhance}
        ariaLabel="描述"
        placeholder=""
      />,
    ),
  )
  await act(async () => container.querySelector<HTMLButtonElement>('.prompt-enhance')!.click())
  expect(enhance).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('超过 10000 字')
})
