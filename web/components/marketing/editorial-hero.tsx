import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
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
              <span className="editorial-hero-eyebrow">AI 图片生成与商品图制作</span>
              <p className="editorial-hero-description">
                写下描述或上传参考图，创作图片、商品主图与服装模特图。
              </p>
              <div className="editorial-hero-actions">
                <Link className="marketing-button" href="/studio">
                  开始 AI 创作 <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
                <Link
                  className="marketing-button marketing-button-secondary"
                  href="/studio?mode=commerce&task=product-main"
                >
                  制作商品图
                </Link>
              </div>
            </div>
          </div>
          <span className="editorial-hero-scroll" data-hero-scroll aria-hidden="true">
            <ArrowDown size={16} /> 向下选择工具
          </span>
        </section>
      </div>
    </HeroCanvas>
  )
}
