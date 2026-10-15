import { describe, expect, it, vi } from 'vitest'
import { applyReverseText, createReverseRequestId, validateReverseFile } from './prompt-reverse'

describe('applying reverse prompts to an existing creation', () => {
  it('preserves the existing description when the user chooses append', () => {
    const existing = '保留原人物身份\n不要改变包装文字'
    expect(applyReverseText(existing, '  柔和侧逆光，暖色背景  ', 'append')).toBe(
      `${existing}\n\n柔和侧逆光，暖色背景`,
    )
    expect(applyReverseText(existing, '暖色背景', 'replace')).toBe('暖色背景')
    expect(applyReverseText('', '暖色背景', 'append')).toBe('暖色背景')
  })
  it('rejects unsupported or oversized image input before a paid request', () => {
    expect(() =>
      validateReverseFile(new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })),
    ).toThrow('JPG')
    expect(() => validateReverseFile(new File([], 'empty.png', { type: 'image/png' }))).toThrow(
      '10 MB',
    )
    expect(() =>
      validateReverseFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
      ),
    ).toThrow('10 MB')
    expect(() =>
      validateReverseFile(new File(['image'], 'photo.webp', { type: 'image/webp' })),
    ).not.toThrow()
  })
  it('creates a valid request ID on local HTTP when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', { getRandomValues: (value: Uint8Array) => value.fill(7) })
    try {
      expect(createReverseRequestId()).toMatch(/^reverse_[a-f0-9]{32}$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
