import type { CSSProperties } from 'react'
import Image from 'next/image'
import type { CommerceRecipe } from '@/lib/commerce-recipe'
import { commerceRecipeExamples } from '@/lib/commerce-recipe-examples'
import styles from './commerce-example-gallery.module.css'

export function CommerceExampleGallery({
  recipeId,
  sizes,
  eager = false,
}: {
  recipeId: CommerceRecipe['id']
  sizes: string
  eager?: boolean
}) {
  const { source, outputs } = commerceRecipeExamples[recipeId]
  const { width, height } = outputs[0]
  const layout = {
    '--case-images': outputs.length + 1,
    '--case-aspect-ratio': `${width} / ${height}`,
  } as CSSProperties

  return (
    <div
      className={styles.gallery}
      data-case-outputs={outputs.length}
      style={layout}
      role="group"
      aria-label="案例原图与生成效果"
    >
      {[source, ...outputs].map(({ src, width, height, alt, label }) => (
        <figure className={styles.item} key={src}>
          <div className={styles.frame}>
            <Image
              src={src}
              width={width}
              height={height}
              alt={alt}
              sizes={sizes}
              loading={eager ? 'eager' : 'lazy'}
            />
          </div>
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
  )
}
