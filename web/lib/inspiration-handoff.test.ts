// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  applyInspirationVariables,
  inspirationTemplate,
  inspirationWorkbenchUrl,
  readInspirationTemplate,
} from './inspiration-handoff'

const template = {
  id: 'template-one',
  title: '商品主图',
  prompt: '把 {{商品}} 放在 {{场景}} 中，保留 {{商品}} 的细节。',
  instructions: '上传清晰正面图。\n保留品牌文字。',
  requiresReference: true,
}

afterEach(() => vi.unstubAllGlobals())

it('carries template requirements while excluding a public example image from creation inputs', () => {
  expect(
    inspirationTemplate({ ...template, imageUrl: '/public/example.webp', width: 1024 }),
  ).toEqual(template)
  expect(inspirationTemplate({ id: 'plain', title: '风景', prompt: '山脉' })).toEqual({
    id: 'plain',
    title: '风景',
    prompt: '山脉',
    instructions: '',
    requiresReference: false,
  })
})

it('creates a short shareable URL that resolves the template by id without embedding its prompt', () => {
  const href = inspirationWorkbenchUrl('template 中文 & more')
  const url = new URL(href, 'http://localhost')
  expect(url.pathname).toBe('/studio')
  expect(url.searchParams.get('inspirationId')).toBe('template 中文 & more')
  expect(url.searchParams.has('prompt')).toBe(false)
})

it('reuses prompt variable validation and retains reference requirements after substitution', () => {
  expect(() => applyInspirationVariables(template, { 商品: '面霜' })).toThrow('请填写全部变量')
  expect(applyInspirationVariables(template, { 商品: ' 面霜 ', 场景: '浴室' })).toEqual({
    ...template,
    prompt: '把 面霜 放在 浴室 中，保留 面霜 的细节。',
  })
})

it('reads the full published template without depending on login tokens or browser handoff storage', async () => {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ prompt: template })))
  vi.stubGlobal('fetch', fetchMock)
  const signal = new AbortController().signal
  expect(await readInspirationTemplate(template.id, signal)).toEqual(template)
  const [url, init] = fetchMock.mock.calls[0]!
  expect(url).toContain('/v1/inspiration/prompts/template-one')
  expect(init).toEqual({ signal, cache: 'no-store', credentials: 'omit' })
  expect(await readInspirationTemplate(template.id, signal)).toEqual(template)
})

it('rejects unpublished and malformed templates instead of applying incomplete data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '提示词已下架' }), { status: 404 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt: { ...template, id: 'other' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt: { id: template.id } }))),
  )
  const signal = new AbortController().signal
  await expect(readInspirationTemplate(template.id, signal)).rejects.toThrow('提示词已下架')
  await expect(readInspirationTemplate(template.id, signal)).rejects.toThrow('模板不匹配')
  await expect(readInspirationTemplate(template.id, signal)).rejects.toThrow('内容不完整')
})
