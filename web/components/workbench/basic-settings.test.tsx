// @vitest-environment jsdom
import { act, useState, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BasicSettings } from './basic-settings'
import { ClothingSettings } from './clothing-settings'

let root: Root
let container: HTMLDivElement
const reload = vi.fn()
const changed = vi.fn()
type Models = ComponentProps<typeof BasicSettings>['imageEndpoints']
function Harness({
  models,
  loading = false,
  error = '',
  mode = 'general',
}: {
  models: Models
  loading?: boolean
  error?: string
  mode?: 'general' | 'commerce'
}) {
  const [selected, setSelected] = useState('a')
  return (
    <BasicSettings
      mode={mode}
      task="product-main"
      aspectRatio="1:1"
      resolution="2K"
      count={1}
      imageEndpoints={models}
      endpointId={selected}
      modelsLoading={loading}
      modelsError={error}
      onReloadModels={reload}
      onSetEndpoint={(value) => {
        changed(value)
        setSelected(value)
      }}
      onSetResolution={() => {}}
      onSetCount={() => {}}
      outputSummary="1 张"
      outputLanguage="none"
      onSetOutputLanguage={() => {}}
      onSetAspectRatio={() => {}}
      style="unspecified"
      referenceStrength="medium"
      onSetStyle={() => {}}
      onSetReferenceStrength={() => {}}
    />
  )
}
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
  reload.mockReset()
  changed.mockReset()
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
const trigger = () => container.querySelector<HTMLButtonElement>('[aria-label="模型选择"]')!
async function open() {
  await act(async () =>
    trigger().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
}

it('shows an explicit empty model state instead of opening an empty selector', async () => {
  await act(async () => root.render(<Harness models={[]} />))
  expect(trigger().disabled).toBe(true)
  expect(trigger().textContent).toContain('暂无可用模型')
  expect(container.textContent).toContain('请联系网站管理员启用')
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="重新加载模型列表"]')!.click(),
  )
  expect(reload).toHaveBeenCalledOnce()
})

it('keeps a controlled model selection when models arrive and when display names change', async () => {
  const models = [
    { id: 'a', name: '模型 A', model: 'A' },
    { id: 'b', name: '模型 B', model: 'B' },
  ]
  await act(async () => root.render(<Harness models={[]} loading />))
  expect(trigger().textContent).toContain('正在读取模型')
  await act(async () => root.render(<Harness models={models} />))
  expect(trigger().disabled).toBe(false)
  expect(trigger().textContent).toContain('模型 A')
  await open()
  const second = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (element) => element.textContent === '模型 B',
  )!
  await act(async () => second.click())
  expect(changed).toHaveBeenCalledWith('b')
  expect(trigger().textContent).toContain('模型 B')
  await act(async () =>
    root.render(<Harness models={[models[0]!, { ...models[1]!, name: '模型 B 新名称' }]} />),
  )
  expect(trigger().textContent).toContain('模型 B 新名称')
})

it('shows model loading failures with a retry action', async () => {
  await act(async () => root.render(<Harness models={[]} error="模型列表读取失败，请重试" />))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('模型列表读取失败')
  expect(trigger().disabled).toBe(true)
  expect(container.querySelector('[aria-label="重新加载模型列表"]')).not.toBeNull()
})

it('filters commerce parameter options when a model has narrower capabilities while retaining the old values', async () => {
  await act(async () =>
    root.render(
      <Harness
        mode="commerce"
        models={[
          {
            id: 'a',
            name: 'A',
            model: 'A',
            capabilities: { referenceImages: true, aspectRatios: ['3:4'], resolutions: ['1K'] },
          },
        ]}
      />,
    ),
  )
  const ratio = container.querySelector<HTMLButtonElement>('[aria-label="尺寸比例"]')!
  expect(ratio.textContent).toContain('1:1')
  await act(async () =>
    ratio.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  expect(
    [...document.querySelectorAll('[role="option"]')].map((element) => element.textContent),
  ).toEqual(['3:4 竖图'])
  await act(async () => document.querySelector<HTMLElement>('[role="option"]')!.click())
  const resolution = container.querySelector<HTMLButtonElement>('[aria-label="清晰度"]')!
  expect(resolution.textContent).toContain('2K')
  await act(async () =>
    resolution.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  expect(
    [...document.querySelectorAll('[role="option"]')].map((element) => element.textContent),
  ).toEqual(['1K'])
})

it('uses the same model constraints for clothing without silently replacing restored parameters', async () => {
  const onChange = vi.fn()
  const value: ComponentProps<typeof ClothingSettings>['value'] = {
    mode: 'product',
    style: 'studio',
    counts: { 'clothing-front': 1 },
    modelCount: 1,
    garments: [],
    models: [],
    scenes: [],
    requirements: '保留用户需求',
    platform: 'smart',
    outputLanguage: 'none',
    endpointId: 'a',
    model: 'A',
    aspectRatio: '3:4',
    resolution: '4K',
  }
  await act(async () =>
    root.render(
      <ClothingSettings
        value={value}
        onChange={onChange}
        endpoints={[
          {
            id: 'a',
            name: 'A',
            model: 'A',
            capabilities: { referenceImages: false, aspectRatios: ['16:9'], resolutions: ['1K'] },
          },
        ]}
      />,
    ),
  )
  expect(onChange).not.toHaveBeenCalled()
  expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('保留用户需求')
  expect(container.querySelector<HTMLButtonElement>('[aria-label="上传服装原图"]')?.disabled).toBe(
    true,
  )
  const ratio = container.querySelector<HTMLButtonElement>('[aria-label="服装画面比例"]')!
  expect(ratio.textContent).toBe('3:4')
  await act(async () =>
    ratio.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    ),
  )
  expect(
    [...document.querySelectorAll('[role="option"]')].map((element) => element.textContent),
  ).toEqual(['16:9 宽屏'])
  await act(async () => document.querySelector<HTMLElement>('[role="option"]')!.click())
  expect(onChange).toHaveBeenCalledWith({ aspectRatio: '16:9' })
})
