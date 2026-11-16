// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useInspirationHandoff } from './use-inspiration-handoff'
import { InspirationHandoffStatus, InspirationTemplateNotice } from './inspiration-template-notice'

const navigation = vi.hoisted(() => ({
  query: 'mode=general&inspirationId=one&projectId=project-a',
  replace: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => '/studio',
  useRouter: () => ({ replace: navigation.replace }),
}))

let root: Root
let host: HTMLDivElement
let handoff: ReturnType<typeof useInspirationHandoff>
const onApply = vi.fn()
const template = {
  id: 'one',
  title: '商品模板',
  prompt: '清晰商品主图',
  instructions: '上传商品正面照片',
  requiresReference: true,
}
function Harness({ ready = true }: { ready?: boolean }) {
  handoff = useInspirationHandoff({ ready, onApply })
  return <InspirationHandoffStatus handoff={handoff} />
}
const response = (prompt = template) => new Response(JSON.stringify({ prompt }))

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
  navigation.query = 'mode=general&inspirationId=one&projectId=project-a'
  navigation.replace.mockReset()
  onApply.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('waits for draft restoration and consumes only the template parameter after its draft is committed', async () => {
  let commit!: () => void
  onApply.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        commit = resolve
      }),
  )
  await act(async () => root.render(<Harness ready={false} />))
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => root.render(<Harness />))
  expect(onApply).toHaveBeenCalledWith(template)
  expect(navigation.replace).not.toHaveBeenCalled()
  await act(async () => commit())
  expect(navigation.replace).toHaveBeenCalledWith('/studio?mode=general&projectId=project-a', {
    scroll: false,
  })
  await act(async () => root.render(<Harness />))
  expect(onApply).toHaveBeenCalledOnce()
})

it('does not let an older template response overwrite a newer selection', async () => {
  const requests: Array<(value: Response) => void> = []
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        requests.push(resolve)
      }),
  )
  await act(async () => root.render(<Harness />))
  navigation.query = 'mode=general&inspirationId=two'
  await act(async () => root.render(<Harness />))
  await act(async () => requests[1]!(response({ ...template, id: 'two', title: '新模板' })))
  await act(async () => requests[0]!(response()))
  expect(onApply).toHaveBeenCalledOnce()
  expect(onApply.mock.calls[0]![0].id).toBe('two')
})

it('preserves the handoff on errors and offers a retry that restores all instructions', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: '临时不可用' }), { status: 503 }))
    .mockResolvedValueOnce(response())
  await act(async () => root.render(<Harness />))
  expect(host.textContent).toContain('临时不可用')
  expect(navigation.replace).not.toHaveBeenCalled()
  await act(async () => handoff.retry())
  expect(onApply).toHaveBeenCalledWith(template)
  expect(handoff.error).toBe('')
})

it('requires variable values before applying and retains material requirements after substitution', async () => {
  vi.mocked(fetch).mockResolvedValue(response({ ...template, prompt: '{{商品}} 的清晰主图' }))
  await act(async () => root.render(<Harness />))
  expect(onApply).not.toHaveBeenCalled()
  expect(document.querySelector('[aria-label="变量 商品"]')).not.toBeNull()
  expect(document.body.textContent).toContain('此模板需要参考图')
  await expect(handoff.applyVariables({})).rejects.toThrow('请填写全部变量')
  await act(async () => handoff.applyVariables({ 商品: '面霜' }))
  expect(onApply).toHaveBeenCalledWith({ ...template, prompt: '面霜 的清晰主图' })
})

it('does not navigate after leaving while an application is being saved', async () => {
  let commit!: () => void
  onApply.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        commit = resolve
      }),
  )
  await act(async () => root.render(<Harness />))
  await act(async () => root.render(null))
  await act(async () => commit())
  expect(navigation.replace).not.toHaveBeenCalled()
})

it('turns an interrupted network request into an actionable timeout without consuming the template', async () => {
  let timeout!: () => void
  const schedule = window.setTimeout.bind(window)
  vi.spyOn(window, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay === 10000) {
      timeout = callback as () => void
      return 0 as unknown as ReturnType<typeof window.setTimeout>
    }
    return schedule(callback, delay, ...args) as unknown as ReturnType<typeof window.setTimeout>
  })
  vi.mocked(fetch).mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      }),
  )
  await act(async () => root.render(<Harness />))
  await act(async () => timeout())
  expect(handoff.error).toContain('读取超时')
  expect(handoff.loading).toBe(false)
  expect(onApply).not.toHaveBeenCalled()
  expect(navigation.replace).not.toHaveBeenCalled()
})

it('shows material requirements and instructions until the user dismisses the template', async () => {
  const dismiss = vi.fn()
  await act(async () =>
    root.render(
      <InspirationTemplateNotice template={template} referenceCount={0} onDismiss={dismiss} />,
    ),
  )
  expect(host.textContent).toContain('请先上传自己的素材')
  expect(host.textContent).toContain(template.instructions)
  await act(async () =>
    root.render(
      <InspirationTemplateNotice template={template} referenceCount={1} onDismiss={dismiss} />,
    ),
  )
  expect(host.textContent).toContain('已添加参考图')
  await act(async () => host.querySelector('button')!.click())
  expect(dismiss).toHaveBeenCalledOnce()
})
