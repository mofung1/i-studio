'use client'

import Image from 'next/image'
import { useState, type CSSProperties } from 'react'
import { CommerceComparison } from '@/components/commerce-comparison'
import { ExampleFrame } from '@/components/commerce-example-frame'
import { getCommerceRecipeForTask, type CommerceRecipe } from '@/lib/commerce-recipe'
import { commerceComparisonExamples, commerceRecipeExamples } from '@/lib/commerce-recipe-examples'
import type { CommerceTaskType } from '@/lib/contracts'
import styles from './commerce-case-preview.module.css'

export function CommerceCasePreview({ task }: { task: CommerceTaskType }) {
  switch (task) {
    case 'product-retouch':
      return <RetouchExample />
    case 'viral-recreate':
      return <RecreateExample />
    default: {
      const recipe = getCommerceRecipeForTask(task)
      return recipe ? <RecipeExample key={recipe.id} recipeId={recipe.id} /> : null
    }
  }
}

function RecipeExample({ recipeId }: { recipeId: CommerceRecipe['id'] }) {
  const { source, outputs } = commerceRecipeExamples[recipeId]
  const images = [source, ...outputs]
  const [selectedIndex, setSelectedIndex] = useState(1)
  const selected = images[selectedIndex] ?? outputs[0]
  const { width, height } = outputs[0]
  const layout = {
    '--case-image-ratio': width / height,
    '--case-image-count': images.length,
  } as CSSProperties

  return (
    <div className={styles.gallery} style={layout}>
      <div className={styles.feature}>
        <Image src={selected.src} alt={selected.alt} fill unoptimized loading="eager" />
      </div>
      <div className={styles.thumbnails} role="group" aria-label="选择案例图片">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            className={styles.thumbnail}
            aria-label={`查看${image.label}`}
            aria-pressed={index === selectedIndex}
            onClick={() => setSelectedIndex(index)}
          >
            <span className={styles.thumbnailFrame}>
              <Image src={image.src} alt="" fill unoptimized />
            </span>
            <span>{image.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function RetouchExample() {
  const { src, ratio, before, after } = commerceComparisonExamples['product-retouch']
  return (
    <div className={styles.retouch} style={{ '--case-image-ratio': ratio } as CSSProperties}>
      <CommerceComparison
        className={styles.retouchComparison}
        src={src}
        title="产品精修"
        beforeAlt={before.alt}
        afterAlt={after.alt}
        beforeLabel={before.label}
        afterLabel={after.label}
        frameRatio={ratio}
        priority
      />
    </div>
  )
}

function RecreateExample() {
  const { src, ratio, before, after } = commerceComparisonExamples['viral-recreate']

  return (
    <div
      className={styles.pair}
      style={{ '--case-image-ratio': ratio } as CSSProperties}
      role="group"
      aria-label="参考版式与套用商品对照"
    >
      {[before, after].map(({ alt, label }, index) => (
        <figure key={label}>
          <div className={styles.pairFrame}>
            <ExampleFrame src={src} index={index} frames={2} ratio={ratio} alt={alt} contain />
          </div>
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
  )
}
