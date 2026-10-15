export const creditScale = 100
export function formatCredits(minor: number) {
  return (minor / creditScale).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
export function parseCredits(value: string): number | null {
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(value.trim())) return null
  const negative = value.trim().startsWith('-')
  const [whole, fraction = ''] = value.trim().replace(/^-/, '').split('.')
  const minor = Number(whole) * creditScale + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(minor) ? (negative ? -minor : minor) : null
}
export interface GenerationQuote {
  modelId: string
  unitPriceMinor: number
  totalMinor: number
  quantity: number
  availableMinor: number
  heldMinor: number
  canAfford: boolean
  creditName: string
  creditScale: number
}
export function refreshAccount() {
  window.dispatchEvent(new Event('istudio-account-refresh'))
}
