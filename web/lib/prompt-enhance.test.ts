// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { enhancePrompt } from './api'
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})
it('forwards the selected reference strength with mixed local and stored images', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ text: '保留人物姿态，改成蓝白插画。' })))
  vi.stubGlobal('fetch', fetcher)
  await enhancePrompt({
    target: 'prompt',
    text: '保留人物姿态，改成蓝白插画',
    files: [
      new File(['image'], 'reference.png', { type: 'image/png' }),
      {
        kind: 'asset',
        assetId: 'owned-reference',
        name: '人物照片',
        type: 'image/png',
        size: 5,
        width: 1,
        height: 1,
        contentPath: '/v1/assets/owned-reference/content',
        thumbnailPath: '/v1/assets/owned-reference/thumbnail',
      },
    ],
    context: { style: 'handdrawn', referenceStrength: 'high' },
  })
  const body = fetcher.mock.calls[0]?.[1]?.body as FormData
  expect(body.get('style')).toBe('handdrawn')
  expect(body.get('referenceStrength')).toBe('high')
  expect(body.getAll('images')).toHaveLength(1)
  expect(JSON.parse(String(body.get('imagesSources')))).toEqual([
    { fileIndex: 0 },
    { assetId: 'owned-reference' },
  ])
})
it('sends authenticated mixed input and surfaces the actionable provider failure', async () => {
  localStorage.setItem('istudio-access-token', 'test-session')
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 'PROMPT_ENHANCE_TIMEOUT',
        message: 'AI 响应超时，原文已保留，请稍后重试',
      }),
      { status: 504 },
    ),
  )
  vi.stubGlobal('fetch', fetcher)
  await expect(enhancePrompt({ target: 'prompt', text: '商品摄影' })).rejects.toThrow('AI 响应超时')
  const request = fetcher.mock.calls[0]?.[1]
  expect(request?.headers).toEqual({ Authorization: 'Bearer test-session' })
  expect((request?.body as FormData).get('text')).toBe('商品摄影')
})
it('explains network errors and rejects empty output', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(enhancePrompt({ target: 'prompt', text: '商品摄影' })).rejects.toThrow(
    '无法连接 AI 服务',
  )
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '   ' }))))
  await expect(enhancePrompt({ target: 'prompt', text: '商品摄影' })).rejects.toThrow(
    'AI 没有返回内容',
  )
})

it('explains malformed AI responses instead of exposing a JSON parser error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>')))
  await expect(enhancePrompt({ target: 'prompt', text: '产品摄影' })).rejects.toThrow(
    'AI 返回的内容格式异常',
  )
})
