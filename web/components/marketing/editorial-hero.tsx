import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight, Monitor } from 'lucide-react'
import { heroArtwork } from '@/lib/marketing-assets'
import { HeroCanvas } from './hero-canvas'

const titleLines = ['想象，', '不止于画面。']

// Only the canvas controller is a client component. All editorial content is server rendered.
export function EditorialHero() {
  const artwork = heroArtwork
  return (
    <HeroCanvas>
      <div className="editorial-hero-stage">
        <section className="editorial-hero-scene" aria-labelledby="hero-title">
          <figure className="editorial-hero-artwork">
            <div className="editorial-hero-artwork-slot" data-hero-slot aria-hidden="true" />
            <div className="editorial-hero-frame" data-hero-frame>
              <div className="editorial-hero-reframe" data-hero-reframe>
                <Image
                  src={artwork.src}
                  alt={artwork.alt}
                  fill
                  priority
                  sizes="100vw"
                  quality={85}
                />
                <div className="editorial-hero-photo-contrast" data-hero-contrast />
              </div>
              <div className="editorial-hero-shade" data-hero-shade />
            </div>
          </figure>
          <div className="editorial-hero-intro">
            <div className="editorial-hero-heading" data-hero-heading>
              <h1 id="hero-title" aria-label="想象，不止于画面。">
                {titleLines.map((line) => (
                  <span className="editorial-hero-title-line" key={line}>
                    <span>{line}</span>
                  </span>
                ))}
              </h1>
              {/* Only glyphs inside the photo change ink; the heading never masks the artwork. */}
              <div className="editorial-hero-title-ink" data-hero-ink aria-hidden="true">
                {titleLines.map((line) => (
                  <span className="editorial-hero-title-line" key={line}>
                    <span>{line}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="editorial-hero-copy" data-hero-copy>
              <span className="editorial-hero-eyebrow">AI 图片生成 · 商品视觉 · 服装模特</span>
              <p className="editorial-hero-description">从一个想法，到可用的创意画面与商品图。</p>
              <div className="editorial-hero-actions">
                <Link className="marketing-button" href="/studio">
                  开始 AI 创作 <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
                <Link
                  className="marketing-button marketing-button-secondary"
                  href="/tools/ai-product-photo"
                >
                  探索电商工具
                </Link>
              </div>
              <span className="editorial-hero-device-hint">
                <Monitor size={14} aria-hidden="true" />
                电脑端体验更完整，可先浏览
              </span>
            </div>
          </div>
          <span className="editorial-hero-scroll" data-hero-scroll aria-hidden="true">
            <ArrowDown size={16} /> 向下，展开想象
          </span>
        </section>
        <section
          id="creation-showcase"
          className="editorial-hero-continuation"
          aria-labelledby="hero-story-title"
          data-hero-story
        >
          <div>
            <h2 id="hero-story-title">
              从一句话开始，
              <br />
              打开一个世界。
            </h2>
            <p>写下想法，让画面发生。</p>
            <Link className="marketing-text-link" href="/tools/ai-image-generator">
              探索 AI 图片生成 <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </HeroCanvas>
  )
}
