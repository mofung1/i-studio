'use client'

import { useState, type CSSProperties } from 'react'
import { ChevronsLeftRight } from 'lucide-react'
import { ExampleFrame } from './example-frame'
import styles from './commerce.module.css'

export function CommerceComparison({
  src,
  title,
  beforeAlt,
  afterAlt,
  afterLabel,
  mode = 'overlay',
  frameRatio = 1.5,
  priority = false,
}: {
  src: string
  title: string
  beforeAlt: string
  afterAlt: string
  afterLabel: string
  mode?: 'overlay' | 'side'
  frameRatio?: number
  priority?: boolean
}) {
  const [split, setSplit] = useState(50)
  return (
    <div
      className={`${styles.comparison} ${mode === 'side' ? styles.sideComparison : ''}`}
      style={{ '--split': `${split}%` } as CSSProperties}
      role="group"
      aria-label={`${title}前后效果示例`}
    >
      <div className={styles.before}>
        <ExampleFrame
          src={src}
          index={0}
          frames={2}
          ratio={frameRatio}
          alt={beforeAlt}
          label="原图示例"
          priority={priority}
        />
      </div>
      <div className={styles.after}>
        <ExampleFrame
          src={src}
          index={1}
          frames={2}
          ratio={frameRatio}
          alt={afterAlt}
          priority={priority}
        />
        <span className={`${styles.imageLabel} ${styles.afterLabel}`}>{afterLabel}</span>
      </div>
      <span className={styles.divider} aria-hidden="true">
        <span>
          <ChevronsLeftRight size={17} />
        </span>
      </span>
      <span className={styles.dragHint} aria-hidden="true">
        拖动对比
      </span>
      <input
        className={styles.range}
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label={`拖动查看${title}前后对比`}
        aria-valuetext={`原图 ${split}%，处理后 ${100 - split}%`}
      />
    </div>
  )
}
