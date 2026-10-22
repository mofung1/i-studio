import Image from 'next/image'
import { galleryAssets } from '@/lib/marketing-assets'

export function CreativeGallery() {
  return (
    <section
      className="marketing-section visual-gallery-section"
      aria-labelledby="visual-gallery-title"
    >
      <div className="marketing-section-heading">
        <h2 id="visual-gallery-title">
          每一种灵感，
          <br />
          都有自己的画面
        </h2>
        <p>AI 概念作品，展示不同的创作方向。</p>
      </div>
      <div className="visual-gallery-grid">
        {galleryAssets.map((asset) => (
          <figure className="visual-gallery-item" key={asset.id}>
            <Image
              src={asset.src}
              alt={asset.alt}
              width={asset.width}
              height={asset.height}
              sizes="(max-width: 760px) calc((100vw - 54px) / 2), 300px"
            />
            <figcaption>{asset.title}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
