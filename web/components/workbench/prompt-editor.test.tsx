// @vitest-environment jsdom
import { act, useState, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PromptEditor } from './prompt-editor'
let root: Root
let container: HTMLDivElement

function Editor({
  initial = '原始描述',
  ...props
}: Partial<ComponentProps<typeof PromptEditor>> & { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <PromptEditor
      value={value}
      onChange={setValue}
      ariaLabel="画面描述"
      placeholder="描述主体与场景"
      compact
      {...props}
    />
  )
}

function inlineInput() {
  return container.querySelector('textarea')!
}

function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]')!
}

function dialogInput() {
  return dialog().querySelector('textarea')!
}

async function edit(input: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openEditor() {
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="大窗编辑"]')!.click(),
  )
}

async function closeEditor() {
  await act(async () =>
    dialog().querySelector<HTMLButtonElement>('button[aria-label="关闭大窗编辑"]')!.click(),
  )
}

async function clickText(text: string, scope: ParentNode = document) {
  await act(async () =>
    [...scope.querySelectorAll('button')].find((button) => button.textContent === text)!.click(),
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
  vi.restoreAllMocks()
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

it('shares edits immediately between the inline view and large editor without a save action', async () => {
  await act(async () => root.render(<Editor />))
  await edit(inlineInput(), '侧栏中的商品描述')
  await openEditor()
  expect(dialogInput().value).toBe('侧栏中的商品描述')
  expect(inlineInput().readOnly).toBe(true)
  await edit(dialogInput(), '大窗修改后的主体、场景与光线\n保留商品包装文字。')
  expect(inlineInput().value).toBe('大窗修改后的主体、场景与光线\n保留商品包装文字。')
  await closeEditor()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(inlineInput().readOnly).toBe(false)
  expect(inlineInput().value).toBe('大窗修改后的主体、场景与光线\n保留商品包装文字。')
  await edit(inlineInput(), '继续在侧栏调整')
  await openEditor()
  expect(dialogInput().value).toBe('继续在侧栏调整')
})

it('preserves the text selection and returns focus to the inline editor when closing', async () => {
  await act(async () => root.render(<Editor initial="主体构图、材质、光线、背景与负面要求" />))
  inlineInput().focus()
  inlineInput().setSelectionRange(2, 6, 'backward')
  await openEditor()
  expect(document.activeElement).toBe(dialogInput())
  expect(dialogInput().selectionStart).toBe(2)
  expect(dialogInput().selectionEnd).toBe(6)
  expect(dialogInput().selectionDirection).toBe('backward')
  dialogInput().setSelectionRange(8, 12, 'forward')
  await closeEditor()
  expect(document.activeElement).toBe(inlineInput())
  expect(inlineInput().selectionStart).toBe(8)
  expect(inlineInput().selectionEnd).toBe(12)
  await openEditor()
  expect(dialogInput().selectionStart).toBe(8)
  expect(dialogInput().selectionEnd).toBe(12)
})

it('does not close the large editor while Escape is being used by a Chinese input method', async () => {
  await act(async () => root.render(<Editor />))
  await openEditor()
  await act(async () => {
    dialogInput().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    dialogInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
    )
  })
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await act(async () => {
    dialogInput().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    dialogInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(inlineInput())
})

it('keeps newer large-editor input when an inline AI request finishes late', async () => {
  let finish!: (value: string) => void
  const enhance = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  await act(async () => root.render(<Editor enhance={enhance} />))
  await clickText('AI 优化提示词')
  await openEditor()
  await edit(dialogInput(), '请求期间补充的真实商品信息')
  await act(async () => finish('基于旧描述的 AI 结果'))
  expect(dialogInput().value).toBe('请求期间补充的真实商品信息')
  expect(inlineInput().value).toBe('请求期间补充的真实商品信息')
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('未覆盖当前编辑')
  expect(enhance).toHaveBeenCalledTimes(1)
})

it('keeps AI undo available after changing views and renders each tool only once', async () => {
  const enhance = vi.fn().mockResolvedValue('优化后的商品描述')
  const reverse = vi.fn()
  await act(async () =>
    root.render(<Editor enhance={enhance} actions={<button onClick={reverse}>图片反推</button>} />),
  )
  await openEditor()
  expect(
    [...document.querySelectorAll('button')].filter((button) => button.textContent === '图片反推'),
  ).toHaveLength(1)
  await clickText('AI 优化提示词', dialog())
  expect(inlineInput().value).toBe('优化后的商品描述')
  await closeEditor()
  await clickText('撤销', container)
  expect(inlineInput().value).toBe('原始描述')
  await openEditor()
  expect(dialogInput().value).toBe('原始描述')
  await clickText('图片反推', dialog())
  expect(reverse).toHaveBeenCalledOnce()
})

it('refreshes the intrinsic editor height when a long prompt is pasted or shortened', async () => {
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return this instanceof HTMLTextAreaElement && this.value.length > 100 ? 900 : 100
  })
  await act(async () => root.render(<Editor />))
  expect(inlineInput().style.height).toBe('100px')
  await edit(inlineInput(), '多段长提示词。'.repeat(200))
  expect(inlineInput().style.height).toBe('900px')
  expect(inlineInput().value).toBe('多段长提示词。'.repeat(200))
  await edit(inlineInput(), '精简后的描述')
  expect(inlineInput().style.height).toBe('100px')
})
