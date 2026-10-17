import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { StudioShell } from '@/components/studio-shell'
import { taskMeta } from '@/components/workbench/shared'
import type { CommerceTaskType } from '@/lib/contracts'
import { CommerceComparison } from './comparison'
import { ExampleFrame } from './example-frame'
import styles from './commerce.module.css'

const examples = [
  { id: 'product-main', layout: 'hero', description: '普通实拍，变成专业商品主图', image: 'main' },
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
  { id: 'clothing-set', layout: 'compact', description: '一件服装，多角度呈现', image: 'clothing' },
  {
    id: 'detail-page',
    layout: 'detail',
    description: '一张商品图，生成成套详情素材',
    image: 'detail',
  },
] as const satisfies ReadonlyArray<{
  id: CommerceTaskType
  layout: string
  description: string
  image: string
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

export default function CommercePage() {
  return (
    <StudioShell section="commerce" title="电商工具">
      <main className={`commerce-page ${styles.page}`} aria-label="电商工具">
        <h1 className="sr-only">电商工具</h1>
        <div className={styles.grid}>
          {examples.map(({ id, layout, description, image }) => {
            const href = `/workbench?mode=commerce&task=${id}`
            const title = taskMeta[id].title
            return (
              <article className={`${styles.card} ${styles[layout]}`} key={id}>
                <Link href={href} className={styles.heading} aria-label={`进入${title}`}>
                  <div>
                    {layout === 'hero' && <span className={styles.badge}>核心工具</span>}
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                  <ArrowRight size={20} className={styles.entryArrow} aria-hidden="true" />
                </Link>
                {id === 'product-main' || id === 'product-retouch' ? (
                  <CommerceComparison
                    src={`/images/commerce/${image}.webp`}
                    title={title}
                    beforeAlt={id === 'product-main' ? '面霜罐普通实拍示例' : '金属杯精修前示例'}
                    afterAlt={
                      id === 'product-main' ? '同款面霜的暖光场景主图示例' : '同款金属杯精修后示例'
                    }
                    afterLabel={id === 'product-main' ? 'AI 生成示例' : '精修示例'}
                    mode={id === 'product-retouch' ? 'side' : 'overlay'}
                    frameRatio={id === 'product-main' ? 900 / 607 : 1.5}
                    priority={id === 'product-main'}
                  />
                ) : (
                  <ExampleFlow kind={image} />
                )}
                {layout === 'hero' && (
                  <div className={styles.footer}>
                    <Link href={href} className={styles.primary}>
                      开始创作 <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                    <span>保留商品主体，重构场景与光影</span>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </main>
    </StudioShell>
  )
}
