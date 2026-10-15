'use client'

import type { ReactNode } from 'react'
import { AuthenticatedImage } from './authenticated-image'

/** Keep the image and its retry control separate from the preview button. */
export function AssetImageCover({
  path,
  alt,
  onOpen,
  children,
}: {
  path: string
  alt: string
  onOpen: () => void
  children?: ReactNode
}) {
  return (
    <div className="asset-cover">
      <AuthenticatedImage path={path} alt={alt} className="asset-cover-image" />
      <button
        type="button"
        className="asset-cover-open"
        aria-label={`查看 ${alt}`}
        onClick={onOpen}
      />
      {children}
    </div>
  )
}
