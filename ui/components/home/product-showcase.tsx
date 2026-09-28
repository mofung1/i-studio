import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

import { productShowcase } from './home-data'

export function ProductShowcase() {
  return (
    <section className="ist-showcase" id="showcase" aria-labelledby="showcase-title">
      <div className="ist-section-heading">
        <span className="ist-section-kicker">Output Gallery</span>
        <h2 id="showcase-title">One product.<br />Endless visuals.</h2>
        <p>同一个商品，延展为货架主图、生活场景、详情页、社媒广告与活动 Banner。</p>
      </div>

      <div className="ist-showcase-grid">
        {productShowcase.map((item) => (
          <Link className={`ist-showcase-card ist-showcase-${item.id}`} href={item.href} key={item.id}>
            <img src={item.asset} alt={`${item.title}示例`} loading="lazy" decoding="async" />
            <div className="ist-showcase-overlay" />
            <div className="ist-showcase-meta">
              <span>{item.titleEn}</span>
              <small>{item.format}</small>
            </div>
            <div className="ist-showcase-copy">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <b>查看案例 <ArrowUpRight size={14} /></b>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

