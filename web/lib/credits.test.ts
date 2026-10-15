import { describe, expect, it } from 'vitest'
import { parseCredits, formatCredits } from './credits'
describe('credit amounts use exact minor units', () => {
  it('preserves decimal model prices and signed manual adjustments', () => {
    expect(parseCredits('0.29')).toBe(29)
    expect(parseCredits('1.01')).toBe(101)
    expect(parseCredits('-20.5')).toBe(-2050)
    expect(parseCredits(' 100 ')).toBe(10000)
    expect(formatCredits(125)).toBe('1.25')
  })
  it('rejects fractional minor units and non-decimal input', () => {
    for (const value of ['1.001', '1e3', 'Infinity', 'NaN', '', '1,000', '--2'])
      expect(parseCredits(value)).toBeNull()
  })
})
