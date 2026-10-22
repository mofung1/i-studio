/** Currency amounts are independent of platform credits and use six decimals. */
export function parseCostMicros(value: string): number | null | undefined {
  const text = value.trim()
  if (!text) return null
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return undefined
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * 1000000 + Number(fraction.padEnd(6, '0'))
  return Number.isSafeInteger(result) && result <= 1000000000000 ? result : undefined
}

export function formatCostMicros(value: number | null, currency: string) {
  return value === null
    ? '未知'
    : `${(value / 1000000).toFixed(6).replace(/\.?0+$/, '')} ${currency}`
}
