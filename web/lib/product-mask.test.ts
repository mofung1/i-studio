import { expect, it } from 'vitest'
import { maskPoint, paintMask } from './product-mask'

it('maps a scaled preview to original pixels and clamps strokes at the image edge', () => {
  const box = { left: 20, top: 40, width: 200, height: 100 }
  expect(maskPoint(120, 90, box, 1600, 800)).toEqual({ x: 800, y: 400 })
  expect(maskPoint(-10, 900, box, 1600, 800)).toEqual({ x: 0, y: 800 })
})
it('exports transparent selected regions and opaque preserved regions, rather than a flattened overlay', () => {
  const pixels = new Uint8Array(16)
  let saved = ''
  const context = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineCap: '',
    lineJoin: '',
    clearRect() {
      pixels.fill(0)
    },
    save() {
      saved = this.globalCompositeOperation
    },
    restore() {
      this.globalCompositeOperation = saved
    },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let row = y; row < y + h; row++)
        for (let col = x; col < x + w; col++)
          pixels[row * 4 + col] = this.globalCompositeOperation === 'destination-out' ? 0 : 255
    },
  }
  paintMask(
    context as unknown as CanvasRenderingContext2D,
    4,
    4,
    [{ kind: 'rectangle', x: 1, y: 1, width: 2, height: 2 }],
    true,
  )
  expect(Array.from(pixels)).toEqual([
    255, 255, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255,
  ])
  expect(context.globalCompositeOperation).toBe('source-over')
})
