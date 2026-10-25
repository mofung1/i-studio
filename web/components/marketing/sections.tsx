import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowUpRight,
  ImagePlus,
  ScanText,
  Shirt,
  Sparkles,
  WandSparkles,
  Package,
} from 'lucide-react'
import { Brand } from '@/components/brand'
import { FeedbackButton } from '@/components/feedback-provider'
import { tools, repositoryUrl, type FaqItem, type MarketingExample } from '@/lib/marketing-content'

const exampleIcons = {
  art: Sparkles,
  product: Package,
  fashion: Shirt,
  photo: ImagePlus,
  retouch: WandSparkles,
  prompt: ScanText,
}

export function Example({
  example,
  priority = false,
}: {
  example: MarketingExample
  priority?: boolean
}) {
  const Icon = exampleIcons[example.kind]
  const photo = example.image ? (
    <Image
      src={example.image.src}
      alt={example.image.alt}
      width={example.image.width}
      height={example.image.height}
      sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 620px"
      priority={priority}
    />
  ) : null
  return (
    <figure className="marketing-example" data-kind={example.kind}>
      <div
        className={`marketing-example-media${example.image ? '' : ' marketing-example-placeholder'}`}
        style={
          example.image
            ? { aspectRatio: `${example.image.width} / ${example.image.height}` }
            : undefined
        }
      >
        {example.image ? (
          photo
        ) : (
          <>
            <div className="marketing-placeholder-art" aria-hidden="true">
              <Icon size={42} strokeWidth={1} />
            </div>
            <span>
              {example.kind === 'prompt'
                ? '图片 → 视觉线索 → 提示词'
                : '留一个位置，给下一张好作品'}
            </span>
          </>
        )}
      </div>
      <figcaption>
        <strong>{example.title}</strong>
        <span>{example.description}</span>
      </figcaption>
    </figure>
  )
}

export function Steps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="marketing-steps">
      {steps.map((step, i) => (
        <li key={step.title}>
          <span className="marketing-step-number" aria-hidden="true">
            {i + 1}
          </span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </li>
      ))}
    </ol>
  )
}

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="marketing-faq">
      {items.map((item) => (
        <details key={item.question}>
          <summary>
            {item.question}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}

export function BottomCta({ compact = false }: { compact?: boolean }) {
  return (
    <section className="marketing-bottom-cta" data-compact={compact || undefined}>
      <div className="marketing-container">
        <h2>你的下一张作品，从这里开始</h2>
        {!compact && <p>无论是创意探索还是商品视觉制作，都可以从 iStudio 开始。</p>}
        <Link className="marketing-button" href="/studio">
          立即开始创作 <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

export function MarketingFooter({ name }: { name: string }) {
  return (
    <footer className="marketing-footer marketing-container">
      <div className="marketing-footer-top">
        <div className="marketing-footer-brand">
          <Brand />
          <p>
            {name}，一站式 AI 图片创作平台。
            <br />
            从个人灵感到商业视觉，让想法有处落笔。
          </p>
        </div>
        <nav aria-label="AI 创作工具">
          <h2>AI 创作</h2>
          {tools
            .filter((tool) => tool.group === 'ai')
            .map((tool) => (
              <Link key={tool.slug} href={`/tools/${tool.slug}`}>
                {tool.name}
              </Link>
            ))}
          <Link href="/inspiration">灵感广场</Link>
        </nav>
        <nav aria-label="电商工具">
          <h2>电商视觉</h2>
          {tools
            .filter((tool) => tool.group === 'commerce')
            .map((tool) => (
              <Link key={tool.slug} href={`/tools/${tool.slug}`}>
                {tool.name}
              </Link>
            ))}
        </nav>
        <nav aria-label="产品链接">
          <h2>产品</h2>
          <Link href="/studio">创作工作台</Link>
          <FeedbackButton className="marketing-feedback" />
          <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
            GitHub 仓库 <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </div>
      <div className="marketing-footer-bottom">
        <span>
          © {new Date().getFullYear()} {name}
        </span>
        <span>创意，自有可能。</span>
      </div>
    </footer>
  )
}
