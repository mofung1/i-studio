import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CommerceExampleGallery } from '@/components/commerce-example-gallery'
import { StudioShell } from '@/components/studio-shell'
import { taskMeta } from '@/components/workbench/shared'
import {
  clothingModelRecipe,
  commerceRecipeUrl,
  detailPageRecipe,
  productMainRecipe,
  type CommerceRecipe,
} from '@/lib/commerce-recipe'
import type { CommerceTaskType } from '@/lib/contracts'
import { studioToolUrl } from '@/lib/studio-navigation'
import { CommerceComparison } from './comparison'
import { ExampleFrame } from './example-frame'
import styles from './commerce.module.css'

const examples = [
  {
    id: 'product-main',
    description: '米白面霜罐的套图实测',
    recipe: productMainRecipe,
  },
  {
    id: 'detail-page',
    description: '绿色滴管瓶的套图实测',
    recipe: detailPageRecipe,
  },
  {
    id: 'clothing-set',
    description: '米白短袖衬衫的上身实测',
    recipe: clothingModelRecipe,
  },
  {
    id: 'product-retouch',
    description: '去除瑕疵，提升材质与质感',
  },
  {
    id: 'viral-recreate',
    description: '参考版式，换成你的商品',
  },
] as const satisfies ReadonlyArray<{
  id: CommerceTaskType
  description: string
  recipe?: CommerceRecipe
}>

function RecreateExample() {
  const src = '/images/commerce/recreate.webp'
  return (
    <div className={styles.flow}>
      <ExampleFrame
        src={src}
        index={0}
        frames={2}
        ratio={2 / 3}
        label="参考版式"
        alt="蓝色商品的参考构图示例"
      />
      <ArrowRight size={12} aria-hidden="true" />
      <ExampleFrame
        src={src}
        index={1}
        frames={2}
        ratio={2 / 3}
        label="套用商品"
        alt="将参考构图应用到橙色商品的示例"
      />
    </div>
  )
}

export default async function CommercePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>
}) {
  const { projectId: rawProjectId } = await searchParams
  const projectId = typeof rawProjectId === 'string' ? rawProjectId.trim() : undefined
  const project = projectId ? new URLSearchParams({ projectId }) : undefined
  return (
    <StudioShell section="commerce" title="电商工具" projectId={projectId}>
      <main className={`commerce-page ${styles.page}`} aria-label="电商工具">
        <h1 className="sr-only">电商工具</h1>
        <div className={styles.grid}>
          {examples.map((example) => {
            const { id, description } = example
            const recipe = 'recipe' in example ? example.recipe : undefined
            const href = studioToolUrl('commerce', id, project)
            const title = taskMeta[id].title
            return (
              <article className={`${styles.card} ${recipe ? styles.recipeCard : ''}`} key={id}>
                <Link href={href} className={styles.heading} aria-label={`进入${title}`}>
                  <div>
                    <h2>{title}</h2>
                    {!recipe && <p>{description}</p>}
                  </div>
                  <ArrowRight size={20} className={styles.entryArrow} aria-hidden="true" />
                </Link>
                {recipe ? (
                  <Link
                    href={commerceRecipeUrl(recipe, project)}
                    className={styles.recipeLink}
                    aria-labelledby={`${id}-recipe-action`}
                    aria-describedby={`${id}-recipe-description ${id}-recipe-summary`}
                  >
                    <div className={styles.recipePreview}>
                      <p id={`${id}-recipe-description`}>{description}</p>
                      <CommerceExampleGallery
                        recipeId={recipe.id}
                        sizes="(max-width: 900px) 30vw, (max-width: 1320px) 14vw, 190px"
                        eager={id === 'product-main'}
                      />
                    </div>
                    <div className={styles.recipeFooter}>
                      <h3 id={`${id}-recipe-summary`}>
                        {recipe.title}
                        <span>
                          {Object.values(recipe.moduleCounts).reduce(
                            (total, count) => total + count,
                            0,
                          )}{' '}
                          张 · {recipe.aspectRatio}
                        </span>
                      </h3>
                      <span id={`${id}-recipe-action`} className={styles.primary}>
                        用我的商品做同款
                        {id !== 'product-main' && (
                          <span className="sr-only">（{recipe.title}）</span>
                        )}
                        <ArrowRight size={17} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                ) : id === 'product-retouch' ? (
                  <CommerceComparison
                    src="/images/commerce/retouch.webp"
                    title={title}
                    beforeAlt="金属杯精修前示例"
                    afterAlt="同款金属杯精修后示例"
                    afterLabel="精修示例"
                    mode="side"
                  />
                ) : (
                  <RecreateExample />
                )}
              </article>
            )
          })}
        </div>
      </main>
    </StudioShell>
  )
}
