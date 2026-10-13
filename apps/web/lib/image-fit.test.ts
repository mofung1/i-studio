import { describe, expect, it } from 'vitest'
import { containImage } from './image-fit'

describe('image display bounds', () => {
  it.each([
    [600, 400, 1, 400, 400],
    [600, 400, 3 / 4, 300, 400],
    [600, 400, 16 / 9, 600, 337.5],
    [320, 700, 9 / 16, 320, 320 * 16 / 9],
  ])('preserves the whole image in a %s × %s viewport', (width, height, ratio, expectedWidth, expectedHeight) => {
    const fitted = containImage(width, height, ratio)
    expect(fitted.width).toBeCloseTo(expectedWidth)
    expect(fitted.height).toBeCloseTo(expectedHeight)
    expect(fitted.width).toBeLessThanOrEqual(width)
    expect(fitted.height).toBeLessThanOrEqual(height)
    expect(fitted.width / fitted.height).toBeCloseTo(ratio)
  })
  it('waits for usable dimensions and handles invalid image metadata', () => {
    expect(containImage(0, 400, 1)).toEqual({ width: 0, height: 0 })
    expect(containImage(600, 0, 1)).toEqual({ width: 0, height: 0 })
    expect(containImage(600, 400, 0)).toEqual({ width: 400, height: 400 })
    expect(containImage(600, 400, Infinity)).toEqual({ width: 400, height: 400 })
    expect(containImage(-5, 400, 1)).toEqual({ width: 0, height: 0 })
  })
})
