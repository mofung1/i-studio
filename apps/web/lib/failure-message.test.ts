import { describe, expect, it } from 'vitest'

import { splitFailureMessage } from './failure-message'

const safetyPayload = '{"taskID":"980f6be0a12e4e3c","status":"failed","statusMessage":"Your prompt was blocked by the content safety policy. Please adjust your prompt and try again.","model":"gpt-image-2","operation":"edit"}'

describe('splitFailureMessage', () => {
  it('把「一句话 + JSON」拆成原因和详情，并把常见英文错误翻成中文', () => {
    const view = splitFailureMessage(`第 1 批生成失败：${safetyPayload}`)
    expect(view.summary).toBe('第 1 批：提示词被内容安全策略拦截，请调整描述后重试。')
    expect(view.detail).toContain('"taskID": "980f6be0a12e4e3c"')
    expect(view.summary).not.toContain('{')
  })

  it('纯 JSON 直接给出可读原因', () => {
    const view = splitFailureMessage(safetyPayload)
    expect(view.summary).toBe('提示词被内容安全策略拦截，请调整描述后重试。')
    expect(view.detail).toContain('gpt-image-2')
  })

  it('短消息原样展示，不带详情', () => {
    expect(splitFailureMessage('  供应商未返回错误详情，请重试。 ')).toEqual({
      summary: '供应商未返回错误详情，请重试。',
      detail: '',
    })
  })

  it('超长纯文本截断到 120 字并保留原文详情', () => {
    const long = 'x'.repeat(300)
    const view = splitFailureMessage(long)
    expect(view.summary.length).toBe(121)
    expect(view.detail).toBe(long)
  })

  it('空输入给出兜底文案', () => {
    expect(splitFailureMessage('')).toEqual({ summary: '生成失败，请重试。', detail: '' })
  })
})
