import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { tools, type ToolContent } from '@/lib/marketing-content'
import { BottomCta, Example, Faq, Steps } from './sections'

export function ToolPage({ tool }: { tool: ToolContent }) {
  return (
    <>
      <main id="marketing-main" className="marketing-container" tabIndex={-1}>
        <div className="marketing-tool-hero">
          <nav className="marketing-breadcrumb" aria-label="面包屑">
            <Link href="/">首页</Link>
            <span aria-hidden="true">/</span>
            <span>{tool.name}</span>
          </nav>
          <h1>{tool.h1}</h1>
          <p>{tool.intro}</p>
          <Link className="marketing-button" href={tool.href}>
            {tool.cta} <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <span className="marketing-cta-note">进入工具后登录使用，生图前可查看预计积分。</span>
        </div>
        <section
          className="marketing-section marketing-section-first"
          aria-labelledby="tool-features"
        >
          <h2 id="tool-features">{tool.name}，从这里了解</h2>
          <div className="marketing-highlight-grid">
            {tool.highlights.map((item, i) => (
              <article
                key={item.title}
                id={tool.slug === 'ai-image-generator' && i === 1 ? 'reference' : undefined}
              >
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-section" aria-labelledby="tool-examples">
          <div className="marketing-section-heading">
            <h2 id="tool-examples">{tool.name}的画面与思路</h2>
            <p>先了解适用方向，再带着自己的素材开始。</p>
          </div>
          <div className="marketing-tool-examples">
            {tool.examples.map((example, i) => (
              <Example key={example.title} example={example} priority={i === 0} />
            ))}
          </div>
          <p className="marketing-example-note">{tool.note}</p>
        </section>
        <section className="marketing-section" aria-labelledby="tool-steps">
          <h2 id="tool-steps">如何使用{tool.name}</h2>
          <Steps steps={tool.steps} />
          <Link className="marketing-text-link" href={tool.href}>
            {tool.cta} <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <section className="marketing-section marketing-faq-section" aria-labelledby="tool-faq">
          <div>
            <h2 id="tool-faq">
              开始之前，
              <br />
              你可能想了解
            </h2>
            <p>关于{tool.name}的常见问题。</p>
          </div>
          <Faq items={tool.faqs} />
        </section>
        <section className="marketing-section marketing-related" aria-labelledby="related-tools">
          <h2 id="related-tools">继续探索创作工具</h2>
          <div>
            {tools
              .filter((other) => other.slug !== tool.slug)
              .map((other) => (
                <Link key={other.slug} href={`/tools/${other.slug}`}>
                  {other.name}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              ))}
          </div>
        </section>
      </main>
      <BottomCta />
    </>
  )
}
