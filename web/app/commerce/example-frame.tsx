import type { CSSProperties } from 'react'
import styles from './commerce.module.css'

/** Crop a generated photo strip in CSS so each example keeps its own full frame. */
export function ExampleFrame({
  src,
  index,
  frames,
  alt,
  label,
  ratio = 1.5,
  priority = false,
}: {
  src: string
  index: number
  frames: number
  alt: string
  label?: string
  ratio?: number
  priority?: boolean
}) {
  return (
    <div className={styles.frame}>
      <div
        className={styles.photoStrip}
        style={
          {
            '--frames': frames,
            '--frame-ratio': ratio,
            '--frame-offset': `${(-100 * index) / frames}%`,
          } as CSSProperties
        }
      >
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          draggable={false}
        />
      </div>
      {label && <span className={styles.imageLabel}>{label}</span>}
    </div>
  )
}
