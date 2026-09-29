/**
 * 供应商的失败信息常常是「一句话 + 一坨 JSON」。
 * 直接铺在提示条里会把布局撑变形，所以拆成：
 * 一句可读的原因（能翻译的常见错误翻译成中文）+ 可展开的原始详情。
 */

/** 常见的供应商英文报错 → 中文说明；没命中就保留原文。 */
const knownReasons: ReadonlyArray<readonly [RegExp, string]> = [
  [/content safety|safety policy|blocked by the content/i, '提示词被内容安全策略拦截，请调整描述后重试。'],
  [/rate limit|too many requests|\b429\b/i, '供应商限流，请稍后重试。'],
  [/timed?\s?out|timeout|deadline exceeded/i, '供应商处理超时，请稍后重试。'],
  [/insufficient|quota|balance|billing/i, '供应商额度不足，请联系管理员。'],
  [/invalid api key|unauthorized|\b401\b/i, '供应商密钥无效，请联系管理员。'],
]

export interface FailureView {
  /** 一句话原因，可直接展示 */
  summary: string
  /** 原始错误详情；没有额外信息时为空字符串 */
  detail: string
}

function translateReason(reason: string): string {
  const trimmed = reason.trim()
  if (trimmed === '') return ''
  for (const [pattern, text] of knownReasons) {
    if (pattern.test(trimmed)) return text
  }
  return trimmed
}

function extractReason(payload: Record<string, unknown>): string {
  for (const key of ['statusMessage', 'message', 'error_description', 'detail', 'error']) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim() !== '') return value
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).message
      if (typeof nested === 'string' && nested.trim() !== '') return nested
    }
  }
  return ''
}

export function splitFailureMessage(raw: string): FailureView {
  const text = (raw ?? '').trim()
  if (text === '') return { summary: '生成失败，请重试。', detail: '' }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    // 「第 1 批生成失败」→「第 1 批」：标题里已经有「生成失败」，避免重复
    const head = text.slice(0, start).replace(/[：:\s]+$/, '').replace(/生成失败$/, '').replace(/[：:\s]+$/, '')
    const jsonText = text.slice(start, end + 1)
    let pretty = jsonText
    let reason = ''
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      pretty = JSON.stringify(parsed, null, 2)
      reason = translateReason(extractReason(parsed))
    } catch {
      // 不是合法 JSON：原文照常展示在详情里
    }
    const summary = reason ? (head ? `${head}：${reason}` : reason) : head
    return { summary: summary || '生成失败，请重试。', detail: pretty }
  }

  if (text.length <= 120) return { summary: text, detail: '' }
  return { summary: `${text.slice(0, 120)}…`, detail: text }
}
