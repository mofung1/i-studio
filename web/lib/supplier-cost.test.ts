import { expect, it } from 'vitest'
import { formatCostMicros, parseCostMicros } from './supplier-cost'

it('keeps unknown supplier costs separate from zero and parses six decimals exactly', () => {
  expect(parseCostMicros('')).toBeNull()
  expect(parseCostMicros('0')).toBe(0)
  expect(parseCostMicros('0.100001')).toBe(100001)
  expect(parseCostMicros('-1')).toBeUndefined()
  expect(parseCostMicros('0.1234567')).toBeUndefined()
  expect(parseCostMicros('1000001')).toBeUndefined()
  expect(formatCostMicros(null, 'CNY')).toBe('未知')
  expect(formatCostMicros(0, 'CNY')).toBe('0 CNY')
})
