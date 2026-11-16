type ImageSize = { width: number; height: number }

interface InspirationRow<T> {
  items: T[]
  widths: number[]
  height: number
}

export function inspirationRowGap(width: number) {
  return width < 480 ? 10 : 16
}

export function arrangeInspirationRows<T extends ImageSize>(items: T[], width: number) {
  const gap = inspirationRowGap(width)
  const targetHeight = width < 480 ? 170 : Math.max(178, Math.min(260, width / 4.3))
  const minimumCardWidth = Math.min(128, (width - gap) / 2)
  const minimumRatio = Math.max(0.57, minimumCardWidth / targetHeight)
  const maximumItems = Math.max(1, Math.floor((width + gap) / (minimumCardWidth + gap)))
  const rows: InspirationRow<T>[] = []
  let rowItems: T[] = []
  let ratios: number[] = []
  let ratioSum = 0

  function fittedHeight(sum: number, count: number) {
    return (width - gap * (count - 1)) / sum
  }

  function finishRow(last = false) {
    if (!rowItems.length) return
    const height = Math.min(
      fittedHeight(ratioSum, rowItems.length),
      targetHeight * (last ? 1 : 1.3),
    )
    rows.push({
      items: rowItems,
      height,
      widths: ratios.map((ratio) => Math.floor(ratio * height)),
    })
    rowItems = []
    ratios = []
    ratioSum = 0
  }

  for (const item of items) {
    const original = item.width > 0 && item.height > 0 ? item.width / item.height : 1
    const ratio = Math.min(2.35, Math.max(minimumRatio, original))
    const nextHeight = fittedHeight(ratioSum + ratio, rowItems.length + 1)
    if (rowItems.length >= 2 && nextHeight < targetHeight) {
      const currentHeight = fittedHeight(ratioSum, rowItems.length)
      if (currentHeight - targetHeight < targetHeight - nextHeight) finishRow()
    }
    rowItems.push(item)
    ratios.push(ratio)
    ratioSum += ratio
    if (
      fittedHeight(ratioSum, rowItems.length) <= targetHeight ||
      rowItems.length >= maximumItems
    ) {
      finishRow()
    }
  }
  finishRow(true)
  return rows
}
