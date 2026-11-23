import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { StudioShell } from '@/components/studio-shell'
import { moduleLabel, taskMeta } from '@/components/workbench/shared'
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
    layout: 'hero',
    description: '面霜场景主图的 AI 概念示例',
    image: 'main',
    recipe: productMainRecipe,
  },
  {
    id: 'product-retouch',
    layout: 'retouch',
    description: '去除瑕疵，提升材质与质感',
    image: 'retouch',
  },
  {
    id: 'viral-recreate',
    layout: 'compact',
    description: '参考版式，换成你的商品',
    image: 'recreate',
  },
  {
    id: 'clothing-set',
    layout: 'clothing',
    description: '米白衬衫上身的 AI 概念示例',
    image: 'clothing',
    recipe: clothingModelRecipe,
  },
  {
    id: 'detail-page',
    layout: 'detail',
    description: '精华液详情图的 AI 概念示例',
    image: 'detail',
    recipe: detailPageRecipe,
  },
] as const satisfies ReadonlyArray<{
  id: CommerceTaskType
  layout: string
  description: string
  image: string
  recipe?: CommerceRecipe
}>

function ExampleFlow({ kind }: { kind: 'recreate' | 'clothing' | 'detail' }) {
  const clothing = kind === 'clothing'
  const detail = kind === 'detail'
  const frames = clothing ? 3 : detail ? 4 : 2
  const src = `/images/commerce/${kind}.webp`
  return (
    <div className={`${styles.flow} ${detail ? styles.detailFlow : ''}`}>
      <ExampleFrame
        src={src}
        index={0}
        frames={frames}
        ratio={detail ? 3 / 4 : 2 / 3}
        label={clothing ? '服装原图' : detail ? '商品原图' : '参考版式'}
        alt={
          clothing ? '米白衬衫平铺示例' : detail ? '精华液商品原图示例' : '蓝色商品的参考构图示例'
        }
      />
      <ArrowRight size={16} className={styles.flowArrow} aria-hidden="true" />
      <div className={`${styles.outputs} ${clothing ? styles.clothingOutputs : ''}`}>
        {Array.from({ length: frames - 1 }, (_, index) => (
          <ExampleFrame
            key={index}
            src={src}
            index={index + 1}
            frames={frames}
            ratio={detail ? 3 / 4 : 2 / 3}
            alt={
              clothing
                ? `同款衬衫模特${index === 0 ? '正面' : '侧面'}上身示例`
                : detail
                  ? ['精华液主视觉示例', '精华液材质特写示例', '精华液场景示例'][index]!
                  : '将参考构图应用到橙色商品的示例'
            }
          />
        ))}
        <span className={styles.imageLabel} aria-hidden="true">
          {clothing ? '上身组图' : detail ? 'AI 详情示例' : '套用商品'}
        </span>
      </div>
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
            const { id, layout, description, image } = example
            const recipe = 'recipe' in example ? example.recipe : undefined
            const outputs =
              recipe?.task === 'clothing-set'
                ? recipe.shots.map(({ label }) => ({ label, count: 1 }))
                : Object.entries(recipe?.moduleCounts ?? {}).map(([key, count]) => ({
                    label: moduleLabel(id, key),
                    count,
                  }))
            const href = studioToolUrl('commerce', id, project)
            const title = taskMeta[id].title
            return (
              <article className={`${styles.card} ${styles[layout]}`} key={id}>
                <Link href={href} className={styles.heading} aria-label={`进入${title}`}>
                  <div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                  <ArrowRight size={20} className={styles.entryArrow} aria-hidden="true" />
                </Link>
                {id === 'product-main' || id === 'product-retouch' ? (
                  <CommerceComparison
                    src={`/images/commerce/${image}.webp`}
                    title={title}
                    beforeAlt={
                      id === 'product-main' ? '灰色背景上的面霜罐示例' : '金属杯精修前示例'
                    }
                    afterAlt={
                      id === 'product-main' ? '同款面霜的暖光场景主图示例' : '同款金属杯精修后示例'
                    }
                    afterLabel={id === 'product-main' ? '场景主图示例' : '精修示例'}
                    mode={id === 'product-retouch' ? 'side' : 'overlay'}
                    frameRatio={id === 'product-main' ? 900 / 607 : 1.5}
                    priority={id === 'product-main'}
                  />
                ) : (
                  <ExampleFlow kind={image} />
                )}
                {recipe && (
                  <Link
                    href={commerceRecipeUrl(recipe, project)}
                    className={styles.recipeLink}
                    aria-labelledby={`${id}-recipe-action`}
                    aria-describedby={`${id}-recipe-summary`}
                  >
                    <div className={styles.recipeInfo} id={`${id}-recipe-summary`}>
                      <h3>
                        {recipe.title} <span>{recipe.aspectRatio}</span>
                      </h3>
                      <ul aria-label="套图内容">
                        {outputs.map(({ label, count }) => (
                          <li key={label}>
                            {label} {count} 张
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span id={`${id}-recipe-action`} className={styles.primary}>
                      用我的商品做同款
                      {id !== 'product-main' && <span className="sr-only">（{recipe.title}）</span>}
                      <ArrowRight size={17} aria-hidden="true" />
                    </span>
                  </Link>
                )}
              </article>
            )
          })}
        </div>
      </main>
    </StudioShell>
  )
}
