import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { showcaseTools, type ShowcaseTool } from '@/lib/tool-showcase'
import { productComparison } from '@/lib/marketing-assets'
import { ProductComparison } from './product-comparison'
import {
  ToolShowcaseAnchors,
  ToolShowcaseCard,
  ToolShowcaseInteraction,
} from './tool-showcase-interaction'

function ToolArtwork({ tool }: { tool: ShowcaseTool }) {
  return (
    <>
      <Image
        src={tool.asset.src}
        alt={tool.asset.alt}
        fill
        sizes="(max-width: 760px) 92px, (max-width: 999px) 85vw, 740px"
      />
      {tool.visual === 'prompt' && (
        <div className="tool-showcase-prompt">
          <span>提示词示意</span>
          <p>绿色玻璃花器，红色掌花。阳光、鲜明撞色与摄影质感。</p>
        </div>
      )}
      {tool.input && (
        <>
          <figure className="tool-showcase-source">
            <Image
              src={tool.input.src}
              alt={`参考输入：${tool.input.alt}`}
              fill
              sizes="(max-width: 760px) 110px, 230px"
            />
            <figcaption>原图</figcaption>
          </figure>
        </>
      )}
    </>
  )
}

export function ToolShowcase() {
  return (
    <section
      id="creation-showcase"
      className="marketing-section tool-showcase-section"
      aria-labelledby="core-tools"
    >
      <div className="marketing-section-heading">
        <h2 id="core-tools">
          从灵感到成品，
          <br />
          创作自有章法。
        </h2>
      </div>
      <ToolShowcaseInteraction
        count={showcaseTools.length}
        anchors={showcaseTools.flatMap((tool, index) =>
          tool.anchor ? [{ hash: `#${tool.anchor}`, index }] : [],
        )}
      >
        <ToolShowcaseAnchors />
        {showcaseTools.map((tool, index) => (
          <ToolShowcaseCard key={tool.id} index={index} tool={tool}>
            <ToolArtwork tool={tool} />
          </ToolShowcaseCard>
        ))}
      </ToolShowcaseInteraction>
      <section className="tool-showcase-result" aria-labelledby="commerce-showcase">
        <div>
          <h3 id="commerce-showcase">同一件商品，延展新的展示场景。</h3>
          <p>上传清晰的商品图，用描述确定背景、光线与构图，再核对商品细节。</p>
          <Link className="marketing-text-link" href="/studio?mode=commerce&task=product-main">
            制作商品场景图 <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <p className="marketing-example-note">
            AI 概念对比。用于商品展示前，请检查外形、颜色与包装文字。
          </p>
        </div>
        <ProductComparison {...productComparison} />
      </section>
    </section>
  )
}
