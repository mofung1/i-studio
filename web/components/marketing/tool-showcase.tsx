import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { showcaseTools, type ShowcaseTool } from '@/lib/tool-showcase'
import {
  ToolShowcaseAnchors,
  ToolShowcaseChoice,
  ToolShowcaseInteraction,
  ToolShowcasePanel,
  ToolShowcaseVisual,
} from './tool-showcase-interaction'

function ToolArtwork({ tool }: { tool: ShowcaseTool }) {
  return (
    <>
      <Image
        src={tool.asset.src}
        alt={tool.asset.alt}
        fill
        sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 999px) 85vw, 740px"
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
    <section className="marketing-section tool-showcase-section" aria-labelledby="core-tools">
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
          <div className="tool-showcase-item" key={tool.id} data-tool={tool.id}>
            <ToolShowcaseChoice index={index} anchor={tool.anchor}>
              <div className="tool-showcase-choice-heading">
                <h3>
                  <Link id={`showcase-${tool.id}`} href={tool.studioHref}>
                    <span className="tool-showcase-name">{tool.name}</span>
                    <span className="tool-showcase-link-arrow" aria-hidden="true">
                      <ArrowUpRight size={19} strokeWidth={1.5} />
                    </span>
                  </Link>
                </h3>
              </div>
              <p className="tool-showcase-choice-description">{tool.description}</p>
            </ToolShowcaseChoice>
            <ToolShowcasePanel index={index}>
              <div role="group" aria-labelledby={`showcase-${tool.id}`}>
                <ToolShowcaseVisual index={index}>
                  <Link
                    className="tool-showcase-artwork-link"
                    href={tool.studioHref}
                    aria-label={tool.cta}
                  >
                    <ToolArtwork tool={tool} />
                  </Link>
                </ToolShowcaseVisual>
                <div className="tool-showcase-preview-copy">
                  <Link className="marketing-text-link tool-showcase-cta" href={tool.studioHref}>
                    {tool.cta} <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </ToolShowcasePanel>
          </div>
        ))}
      </ToolShowcaseInteraction>
    </section>
  )
}
