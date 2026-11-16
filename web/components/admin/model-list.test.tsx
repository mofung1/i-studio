// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AdminModelList } from './model-list'
import type { AdminModel } from '@/lib/admin'
import type { AIEndpoint } from '@/lib/ai-settings'

const endpoint: AIEndpoint = {
  id: 'image-service',
  name: '演示渠道',
  purpose: 'image',
  protocol: 'openai_images',
  baseUrl: 'https://fixture.example/v1',
  model: '',
  timeoutSeconds: 300,
  capabilities: {},
  enabled: true,
  isDefault: false,
  apiKeyConfigured: true,
  apiKeyMasked: '***',
}
const model: AdminModel = {
  id: 'public-model',
  name: '公开模型',
  version: 1,
  priceMinor: 100,
  enabled: true,
  isDefault: false,
  channels: [
    { endpointId: endpoint.id, upstreamModelId: 'image-model', isActive: true, enabled: true },
  ],
  capabilities: { referenceImages: true, aspectRatios: ['1:1'], resolutions: ['1K'] },
}
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function render(models = [model], endpoints = [endpoint]) {
  await act(async () =>
    root.render(
      <AdminModelList models={models} endpoints={endpoints} unit="积分" onEdit={() => {}} />,
    ),
  )
}

it('distinguishes a published model with an unavailable channel from a usable model', async () => {
  await render()
  expect(host.querySelector('tbody')?.textContent).toContain('已上架')
  await render([model], [{ ...endpoint, enabled: false }])
  expect(host.querySelector('tbody')?.textContent).toContain('渠道不可用')
  await render([{ ...model, channels: [{ ...model.channels[0]!, enabled: false }] }])
  expect(host.querySelector('tbody')?.textContent).toContain('渠道不可用')
  await render([{ ...model, enabled: false }])
  expect(host.querySelector('tbody')?.textContent).toContain('未上架')
})

it('directs an empty catalog to channel configuration only when a channel is missing', async () => {
  await render([], [])
  expect(host.querySelector('.admin-data-empty')?.textContent).toContain('先连接一个生图渠道')
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/settings?tab=image')
  await render([])
  expect(host.querySelector('.admin-data-empty')?.textContent).toContain('还没有前台模型')
  expect(host.querySelector('a')).toBeNull()
})
