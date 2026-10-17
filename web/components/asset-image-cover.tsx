'use client'

import type { ReactNode } from 'react'
import { AuthenticatedImage } from './authenticated-image'

/** Keep the image and its retry control separate from the preview button. */
export function AssetImageCover({
  path,
  alt,
  onOpen,
  openLabel,
  selected,
  disabled,
  children,
}: {
  path: string
  alt: string
  onOpen: () => void
  openLabel?: string
  selected?: boolean
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <div className="asset-cover">
      <AuthenticatedImage path={path} alt={alt} className="asset-cover-image" />
      <button
        type="button"
        className="asset-cover-open"
        aria-label={openLabel ?? `查看 ${alt}`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onOpen}
      />
      {children}
    </div>
  )
}
