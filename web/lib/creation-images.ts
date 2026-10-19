import type { LibraryAsset } from './library'

/** Existing assets remain references; only new local files need uploading. */
export interface StoredImage {
  kind: 'asset'
  assetId: string
  name: string
  type: string
  size: number
  width: number
  height: number
  contentPath: string
  thumbnailPath: string
}
export type CreationImage = File | StoredImage
export function isStoredImage(image: CreationImage): image is StoredImage {
  return 'kind' in image && image.kind === 'asset'
}
export function sameCreationImage(a: CreationImage, b: CreationImage) {
  return a === b || (isStoredImage(a) && isStoredImage(b) && a.assetId === b.assetId)
}

/** A restored reverse task contains a new File, even when its original is already selected. */
export async function reuseExistingCreationImage(
  image: CreationImage,
  candidates: CreationImage[],
  loadStored: (image: StoredImage) => Promise<Blob>,
): Promise<CreationImage> {
  const existing = candidates.find((candidate) => sameCreationImage(candidate, image))
  if (existing) return existing
  if (isStoredImage(image)) return image
  const possibleMatches = candidates.filter(
    (candidate) => candidate.size === image.size && candidate.type === image.type,
  )
  if (!possibleMatches.length) return image
  const bytes = new Uint8Array(await image.arrayBuffer())
  for (const candidate of possibleMatches) {
    const blob = isStoredImage(candidate) ? await loadStored(candidate) : candidate
    const other = new Uint8Array(await blob.arrayBuffer())
    if (bytes.length === other.length && bytes.every((byte, index) => byte === other[index]))
      return candidate
  }
  return image
}

export function storedImage(asset: LibraryAsset): StoredImage {
  return {
    kind: 'asset',
    assetId: asset.id,
    name: asset.title || asset.filename,
    type: asset.mime,
    size: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    contentPath: asset.contentPath,
    thumbnailPath: asset.thumbnailPath,
  }
}

/** Preserve role and order in a mixed selection without sending stored bytes again. */
export function appendCreationImages(body: FormData, field: string, images: CreationImage[]) {
  let fileIndex = 0
  const sources = images.map((image) => {
    if (isStoredImage(image)) return { assetId: image.assetId }
    body.append(field, image)
    return { fileIndex: fileIndex++ }
  })
  if (sources.some((source) => 'assetId' in source))
    body.append(`${field}Sources`, JSON.stringify(sources))
}
