// @vitest-environment jsdom
import { act, useState, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Workbench } from './workbench'
import type { CreatorSidebar } from './workbench/creator-sidebar'
import type { ResultWorkspace } from './workbench/result-workspace'
import type { WorkbenchRail } from './workbench/workbench-rail'
import type { CreationDraftStatus } from './workbench/creation-draft-status'
import type { ClothingSettings, ClothingSettingsValue } from './workbench/clothing-settings'
import type { GenerationNotice, SubmitParams } from './workbench/use-generation-task'
import type { StandardCreationDraft } from '@/lib/creation-draft-schema'
import type { StoredImage } from '@/lib/creation-images'

const mocks = vi.hoisted(() => ({
  query: 'mode=general&projectId=project-a',
  replace: vi.fn(),
  push: vi.fn(),
  submit: vi.fn(),
  notice: vi.fn(),
  readImage: vi.fn(),
  saveDraft: vi.fn(),
  flushDraft: vi.fn(),
  markEntryApplied: vi.fn(),
  restorationFailed: false,
}))

type DraftOptions<T = StandardCreationDraft> = {
  value: T
  defaultValue: T
  emptyValue?: T
  onRestore: (value: T) => void
}
let draftOptions: Pick<DraftOptions, 'value'>
let clothingDraftOptions: Pick<DraftOptions<ClothingSettingsValue>, 'value'>
let sidebar: ComponentProps<typeof CreatorSidebar>
let clothingSettings: ComponentProps<typeof ClothingSettings>
let results: ComponentProps<typeof ResultWorkspace>
let rail: ComponentProps<typeof WorkbenchRail>
let draftControls: ComponentProps<typeof CreationDraftStatus>

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/studio',
  useSearchParams: () => new URLSearchParams(mocks.query),
}))
vi.mock('./account-provider', () => ({
  useAccount: () => ({
    account: {
      authenticated: true,
      user: { id: 'creator' },
      available: 5000,
      held: 0,
      creditName: '积分',
    },
    loading: false,
    error: '',
  }),
}))
vi.mock('@/lib/library', async (original) => ({
  ...(await original<object>()),
  loadStoredImage: mocks.readImage,
}))
vi.mock('./workbench/use-creation-draft', () => ({
  useCreationDraft: <T extends StandardCreationDraft | ClothingSettingsValue>(
    options: DraftOptions<T>,
  ) => {
    if ('garments' in options.value)
      clothingDraftOptions = { value: options.value as ClothingSettingsValue }
    else draftOptions = { value: options.value as StandardCreationDraft }
    return {
      ready: true,
      status: mocks.restorationFailed ? 'error' : 'saved',
      error: mocks.restorationFailed ? '草稿暂时无法读取，请重试' : '',
      restorationFailed: mocks.restorationFailed,
      restoredSource: null,
      save: mocks.saveDraft,
      flush: mocks.flushDraft,
      clear: async () => options.onRestore(options.emptyValue ?? options.defaultValue),
      retry: async () => {},
      markEntryApplied: mocks.markEntryApplied,
    }
  },
}))
vi.mock('./workbench/clothing-settings', () => ({
  ClothingSettings: (props: ComponentProps<typeof ClothingSettings>) => {
    clothingSettings = props
    return null
  },
}))
vi.mock('./workbench/creator-panel', () => ({
  CreatorPanel: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('./workbench/generate-bar', () => ({ GenerateBar: () => null }))
vi.mock('./workbench/creation-draft-status', () => ({
  CreationDraftStatus: (props: ComponentProps<typeof CreationDraftStatus>) => {
    draftControls = props
    return <button onClick={() => void props.onClear()}>清空草稿</button>
  },
}))
vi.mock('./workbench/creator-sidebar', () => ({
  CreatorSidebar: (props: ComponentProps<typeof CreatorSidebar>) => {
    sidebar = props
    return (
      <section>
        {props.templateNotice}
        <output data-prompt>{props.prompt}</output>
        <output data-references>{props.referenceFiles.length}</output>
        {props.notice && <p role="status">{props.notice.message}</p>}
        <button onClick={props.onSubmit}>生成</button>
      </section>
    )
  },
}))
vi.mock('./workbench/result-workspace', () => ({
  ResultWorkspace: (props: ComponentProps<typeof ResultWorkspace>) => {
    results = props
    return null
  },
}))
vi.mock('./workbench/workbench-rail', () => ({
  WorkbenchRail: (props: ComponentProps<typeof WorkbenchRail>) => {
    rail = props
    return null
  },
}))
vi.mock('./workbench/workbench-header', () => ({
  WorkbenchHeader: ({ collectionTools }: { collectionTools?: ReactNode }) => <>{collectionTools}</>,
}))
vi.mock('./workbench/creation-library-tools', () => ({ CreationLibraryTools: () => null }))
vi.mock('./workbench/use-workbench-handoff', async (original) => ({
  ...(await original<object>()),
  useWorkbenchHandoff: () => {},
}))
vi.mock('./workbench/use-reverse-prompt-handoff', () => ({ useReversePromptHandoff: () => {} }))
vi.mock('./workbench/use-personal-prompt-handoff', () => ({ usePersonalPromptHandoff: () => {} }))
vi.mock('./workbench/use-generation-task', () => ({
  useGenerationTask: () => {
    const [notice, setNotice] = useState<GenerationNotice | null>(null)
    return {
      generationTask: null,
      resultHistory: [],
      activeResultIndex: 0,
      activeResult: null,
      isSubmitting: false,
      isGenerating: false,
      notice,
      setNotice: (next: GenerationNotice | null) => {
        mocks.notice(next)
        setNotice(next)
      },
      setActiveResultIndex: vi.fn(),
      submit: mocks.submit,
      removeResult: vi.fn(),
    }
  },
}))

let root: Root
let host: HTMLDivElement
const template = {
  id: 'reference-template',
  title: '商品广告模板',
  prompt: '保留商品外观，制作自然光广告图',
  instructions: '上传清晰的商品正面照片，并保留包装文字。',
  requiresReference: true,
}
function image(id: string): StoredImage {
  return {
    kind: 'asset',
    assetId: id,
    name: id,
    type: 'image/png',
    size: 100,
    width: 800,
    height: 600,
    contentPath: `/v1/assets/${id}/content`,
    thumbnailPath: `/v1/assets/${id}/thumbnail`,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function render(mode: 'general' | 'commerce' = 'general') {
  await act(async () => root.render(<Workbench initialMode={mode} initialTask="product-main" />))
}
async function setReferences(count: number) {
  const images = Array.from({ length: count }, (_, index) => image(`selected-${index}`))
  await act(async () => sidebar.onSetReferenceFiles(images))
  return images
}
async function continueImage(id = 'result') {
  await act(async () =>
    results.onUseImageAsReference(`/v1/assets/${id}/content`, {
      mode: 'general',
      taskType: 'product-main',
    }),
  )
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  mocks.query = 'mode=general&projectId=project-a'
  mocks.replace.mockReset()
  mocks.push.mockReset()
  mocks.submit.mockReset().mockResolvedValue(undefined)
  mocks.notice.mockReset()
  mocks.readImage.mockReset().mockImplementation(async (path: string) => image(path.split('/')[3]!))
  mocks.saveDraft.mockReset().mockResolvedValue(undefined)
  mocks.flushDraft.mockReset().mockResolvedValue(undefined)
  mocks.markEntryApplied.mockReset()
  mocks.restorationFailed = false
  localStorage.setItem('istudio-access-token', 'creator-token')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/inspiration/prompts/'))
        return new Response(JSON.stringify({ prompt: template }))
      if (url.endsWith('/capabilities'))
        return new Response(
          JSON.stringify({
            aiEnabled: true,
            imageEndpoints: [
              {
                id: 'model-a',
                model: 'gpt-image-2',
                name: '模型 A',
                isDefault: true,
                capabilities: { referenceImages: true, aspectRatios: ['1:1'], resolutions: ['2K'] },
              },
            ],
          }),
        )
      throw new Error(`Unexpected request: ${url}`)
    }),
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('keeps all six references and reports an error rather than success when full', async () => {
  await render()
  const originals = await setReferences(6)
  await continueImage()
  expect(sidebar.referenceFiles).toEqual(originals)
  expect(sidebar.notice).toEqual({
    kind: 'error',
    message: expect.stringContaining('请先移除一张'),
  })
  expect(mocks.notice.mock.calls.some(([notice]) => notice?.kind === 'success')).toBe(false)
})

it('checks the latest selection when the user fills the last slot during image loading', async () => {
  const pending = deferred<StoredImage>()
  mocks.readImage.mockReturnValue(pending.promise)
  await render()
  await setReferences(5)
  await continueImage()
  const originals = await setReferences(6)
  await act(async () => pending.resolve(image('result')))
  expect(sidebar.referenceFiles).toEqual(originals)
  expect(sidebar.notice?.kind).toBe('error')
})

it('does not append the same stored result twice even if its metadata is reloaded', async () => {
  await render()
  await setReferences(5)
  await continueImage()
  await continueImage()
  expect(sidebar.referenceFiles).toHaveLength(6)
  expect(
    sidebar.referenceFiles.filter((file) => 'assetId' in file && file.assetId === 'result'),
  ).toHaveLength(1)
  expect(sidebar.notice?.message).toContain('无需重复添加')
})

it('does not exceed capacity when two image loads complete in the same batch', async () => {
  const first = deferred<StoredImage>()
  const second = deferred<StoredImage>()
  mocks.readImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  await render()
  await setReferences(5)
  await continueImage('first')
  await continueImage('second')
  await act(async () => {
    first.resolve(image('first'))
    second.resolve(image('second'))
  })
  expect(sidebar.referenceFiles).toHaveLength(6)
  expect(sidebar.referenceFiles.at(-1)).toEqual(image('first'))
  expect(sidebar.notice?.kind).toBe('error')
})

it('preserves the project when switching modes and commerce tools without replaying old input', async () => {
  mocks.query = 'mode=general&projectId=project-a&prompt=old&resumeTask=old-task'
  await render()
  await act(async () => rail.onChangeTask?.('detail-page'))
  expect(mocks.replace).toHaveBeenLastCalledWith(
    '/studio?mode=commerce&task=detail-page&projectId=project-a',
  )
  await act(async () => rail.onChangeMode?.('general'))
  expect(mocks.replace).toHaveBeenLastCalledWith('/studio?mode=general&projectId=project-a')
  expect(mocks.flushDraft).toHaveBeenCalledTimes(2)
})

it('ignores a late image when the user switches tools before loading completes', async () => {
  const pending = deferred<StoredImage>()
  mocks.readImage.mockReturnValue(pending.promise)
  await render()
  const originals = await setReferences(2)
  await continueImage()
  await act(async () => rail.onChangeTask?.('detail-page'))
  mocks.notice.mockClear()
  await act(async () => pending.resolve(image('result')))
  expect(sidebar.referenceFiles).toEqual(originals)
  expect(mocks.notice).not.toHaveBeenCalled()
  expect(mocks.replace).toHaveBeenCalledOnce()
})

it('does not restore a pending result after the user clears the draft', async () => {
  const pending = deferred<StoredImage>()
  mocks.readImage.mockReturnValue(pending.promise)
  await render()
  await setReferences(2)
  await continueImage()
  await act(async () => draftControls.onClear())
  expect(sidebar.referenceFiles).toEqual([])
  mocks.notice.mockClear()
  await act(async () => pending.resolve(image('result')))
  expect(sidebar.referenceFiles).toEqual([])
  expect(mocks.notice).not.toHaveBeenCalled()
})

it('does not update state or navigate after leaving with an image load pending', async () => {
  const pending = deferred<StoredImage>()
  mocks.readImage.mockReturnValue(pending.promise)
  await render()
  await continueImage()
  await act(async () => root.render(null))
  mocks.notice.mockClear()
  await act(async () => pending.resolve(image('result')))
  expect(mocks.notice).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('preserves full template metadata and blocks generation until the required reference is supplied', async () => {
  mocks.query += '&inspirationId=reference-template'
  await render()
  expect(sidebar.prompt).toBe(template.prompt)
  expect(host.textContent).toContain(template.title)
  expect(host.textContent).toContain(template.instructions)
  expect(host.textContent).toContain('请先上传自己的素材')
  expect(draftOptions.value.inspirationTemplate).toEqual(template)
  expect(mocks.saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: template.prompt,
      inspirationTemplate: template,
      referenceFiles: [],
    }),
  )
  expect(mocks.replace).toHaveBeenCalledWith('/studio?mode=general&projectId=project-a', {
    scroll: false,
  })
  await act(async () => sidebar.onSubmit())
  expect(mocks.submit).not.toHaveBeenCalled()
  expect(sidebar.notice?.message).toContain('此模板需要参考图')

  await setReferences(1)
  await act(async () => sidebar.onSubmit())
  expect(mocks.submit).toHaveBeenCalledOnce()
  const submitted = mocks.submit.mock.calls[0]![0] as SubmitParams
  expect(submitted.buildPayload([], ['selected-0'])).toMatchObject({
    projectId: 'project-a',
    prompt: template.prompt,
    referenceAssetIds: ['selected-0'],
  })
})

it('does not consume the template link until its full draft has been saved', async () => {
  const saved = deferred<void>()
  mocks.saveDraft.mockReturnValue(saved.promise)
  mocks.query += '&inspirationId=reference-template'
  await render()
  expect(sidebar.prompt).toBe(template.prompt)
  expect(mocks.replace).not.toHaveBeenCalled()
  await act(async () => sidebar.onSubmit())
  expect(mocks.submit).not.toHaveBeenCalled()
  expect(sidebar.notice?.message).toContain('正在带入')
  await act(async () => saved.resolve())
  expect(mocks.replace).toHaveBeenCalledWith('/studio?mode=general&projectId=project-a', {
    scroll: false,
  })
})

it('keeps a failed standard draft untouched when capabilities arrive and allows explicit model selection', async () => {
  mocks.restorationFailed = true
  const capabilities = deferred<Response>()
  vi.mocked(fetch).mockReturnValueOnce(capabilities.promise)
  await render()
  const beforeCapabilities = draftOptions.value
  expect(beforeCapabilities.endpointId).toBe('')
  expect(draftControls.status).toBe('error')

  const endpoint = { id: 'model-b', model: 'new-model', name: '模型 B', isDefault: true }
  await act(async () =>
    capabilities.resolve(
      new Response(
        JSON.stringify({
          aiEnabled: true,
          imageEndpoints: [endpoint],
        }),
      ),
    ),
  )

  expect(sidebar.imageEndpoints).toEqual([expect.objectContaining(endpoint)])
  expect(sidebar.modelsLoading).toBe(false)
  expect(draftOptions.value).toBe(beforeCapabilities)
  expect(sidebar.endpointId).toBe('')
  expect(sidebar.model).toBe('gpt-image-2')
  expect(draftControls.status).toBe('error')

  await act(async () => sidebar.onSetEndpoint(endpoint.id))
  expect(draftOptions.value).toMatchObject({ endpointId: endpoint.id, model: endpoint.model })
})

it('keeps a failed clothing draft untouched when capabilities arrive and allows explicit model selection', async () => {
  mocks.restorationFailed = true
  mocks.query = 'mode=commerce&task=clothing-set&projectId=project-a'
  const capabilities = deferred<Response>()
  vi.mocked(fetch).mockReturnValueOnce(capabilities.promise)
  await act(async () =>
    root.render(<Workbench initialMode="commerce" initialTask="clothing-set" />),
  )
  const beforeCapabilities = clothingDraftOptions.value
  expect(beforeCapabilities.endpointId).toBe('')
  expect(draftControls.status).toBe('error')

  const endpoint = { id: 'model-b', model: 'new-model', name: '模型 B', isDefault: true }
  await act(async () =>
    capabilities.resolve(
      new Response(
        JSON.stringify({
          aiEnabled: true,
          imageEndpoints: [endpoint],
        }),
      ),
    ),
  )

  expect(clothingSettings.endpoints).toEqual([expect.objectContaining(endpoint)])
  expect(clothingDraftOptions.value).toBe(beforeCapabilities)
  expect(clothingSettings.value.endpointId).toBe('')
  expect(clothingSettings.value.model).toBe('gpt-image-2')
  expect(draftControls.status).toBe('error')

  await act(async () =>
    clothingSettings.onChange({ endpointId: endpoint.id, model: endpoint.model }),
  )
  expect(clothingDraftOptions.value).toMatchObject({
    endpointId: endpoint.id,
    model: endpoint.model,
  })
})
