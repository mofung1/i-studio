import { expect, it } from 'vitest'
import { arrangeInspirationRows, inspirationRowGap } from './inspiration-rows'

const sizes = [
  { width: 1200, height: 800 },
  { width: 600, height: 900 },
  { width: 800, height: 800 },
  { width: 1280, height: 720 },
  { width: 480, height: 720 },
  { width: 1720, height: 744 },
  { width: 520, height: 1600 },
  { width: 0, height: 0 },
]

it.each([292, 347, 740, 1110])('lays out mixed formats in order within %d pixels', (width) => {
  const rows = arrangeInspirationRows(sizes, width)
  expect(rows.flatMap((row) => row.items)).toEqual(sizes)
  for (const row of rows) {
    const occupiedWidth = row.widths.reduce((sum, value) => sum + value, 0)
    expect(occupiedWidth + (row.items.length - 1) * inspirationRowGap(width)).toBeLessThanOrEqual(
      width,
    )
    expect(row.widths.every((value) => value > 0)).toBe(true)
    expect(row.height).toBeLessThanOrEqual(338)
  }
})

it('uses different widths for portrait, square and landscape art in the same row', () => {
  const row = arrangeInspirationRows(sizes, 1110)[0]!
  expect(row.items.slice(0, 3)).toEqual(sizes.slice(0, 3))
  expect(row.widths[0]).toBeGreaterThan(row.widths[2]!)
  expect(row.widths[2]).toBeGreaterThan(row.widths[1]!)
  expect(row.widths[1]! / row.height).toBeCloseTo(2 / 3, 2)
})
