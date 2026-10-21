import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { galleryAssets, productComparison } from '@/lib/marketing-assets'
import { ProductComparison } from './product-comparison'
import { ArtworkGallery } from './artwork-gallery'

export function EcommerceShowcase() {
  return (
    <section className="marketing-section visual-commerce" aria-labelledby="commerce-showcase">
      <div className="marketing-split marketing-split-reverse">
        <div className="marketing-split-copy">
          <h2 id="commerce-showcase">
            让商品视觉制作
            <br />
            更简单
          </h2>
          <p>从一张商品图，延展更多场景与表达。</p>
          <ul className="marketing-checks">
            {['商品主图与展示场景', '产品图片精修', '按模块组织详情素材', '服装组图与模特上身'].map(
              (text) => (
                <li key={text}>
                  <Check size={17} aria-hidden="true" />
                  {text}
                </li>
              ),
            )}
          </ul>
          <Link className="marketing-text-link" href="/tools/ai-product-photo">
            探索 AI 电商工具 <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <ProductComparison {...productComparison} />
      </div>
    </section>
  )
}

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
      </div>
      <ArtworkGallery>
        {galleryAssets.map((asset) => (
          <figure className="visual-gallery-item" key={asset.id}>
            <Image
              src={asset.src}
              alt={asset.alt}
              width={asset.width}
              height={asset.height}
              sizes="(max-width: 760px) 75vw, 360px"
            />
          </figure>
        ))}
      </ArtworkGallery>
    </section>
  )
}
