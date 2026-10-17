// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { enhancePrompt } from './api'
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
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
