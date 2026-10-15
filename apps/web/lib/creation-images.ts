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
export function storedImage(asset: LibraryAsset): StoredImage {
  return { kind: 'asset', assetId: asset.id, name: asset.title || asset.filename, type: asset.mime, size: asset.sizeBytes, width: asset.width, height: asset.height, contentPath: asset.contentPath, thumbnailPath: asset.thumbnailPath }
}

/** Preserve role and order in a mixed selection without sending stored bytes again. */
export function appendCreationImages(body: FormData, field: string, images: CreationImage[]) {
  let fileIndex = 0
  const sources = images.map(image => {
    if (isStoredImage(image)) return { assetId: image.assetId }
    body.append(field, image)
    return { fileIndex: fileIndex++ }
  })
  if (sources.some(source => 'assetId' in source)) body.append(`${field}Sources`, JSON.stringify(sources))
}
