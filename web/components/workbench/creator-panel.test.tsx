// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CreatorPanel } from './creator-panel'

let root: Root
let container: HTMLDivElement
function Harness({ error = false }: { error?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <CreatorPanel
      className="commerce-settings"
      side="left"
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
      notice={error ? { kind: 'error', message: '请先上传商品原图' } : null}
      isSubmitting={false}
      isGenerating={!error}
      taskStatus={error ? 'failed' : 'processing'}
    >
      <div id="creation-settings-body" className="configuration-scroll" hidden={collapsed}>
        <textarea aria-label="商品需求" defaultValue="保留商品细节" />
        <input type="number" aria-label="模块张数" defaultValue={4} />
      </div>
    </CreatorPanel>
  )
}
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
it('keeps commerce drafts and module quantities mounted while collapsed, then restores editor focus', async () => {
  await act(async () => root.render(<Harness />))
  const textarea = container.querySelector('textarea')!
  textarea.value = '浅灰背景，保留商品纹理'
  textarea.focus()
  const toggle = container.querySelector<HTMLButtonElement>('.creator-panel-toggle')!
  await act(async () => toggle.click())
  expect(container.querySelector('.configuration-scroll')?.hasAttribute('hidden')).toBe(true)
  expect(document.activeElement).toBe(toggle)
  expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('正在生成')
  await act(async () => toggle.click())
  expect(container.querySelector('textarea')).toBe(textarea)
  expect(textarea.value).toBe('浅灰背景，保留商品纹理')
  expect(container.querySelector('input')?.value).toBe('4')
  expect(document.activeElement).toBe(textarea)
})
it('keeps the full actionable error available in the collapsed status badge', async () => {
  await act(async () => root.render(<Harness error />))
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.creator-panel-toggle')!.click(),
  )
  const status = container.querySelector('[role="status"]')!
  expect(status.getAttribute('aria-label')).toBe('请先上传商品原图')
  expect(status.getAttribute('title')).toBe('请先上传商品原图')
  expect(status.textContent).toBe('需处理')
})
