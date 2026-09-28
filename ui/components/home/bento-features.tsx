import { Image, Layers3, Megaphone, Palette, Scaling, Sparkles } from 'lucide-react'

import { imageAssets } from './home-data'

export function BentoFeatures() {
  return (
    <section className="ist-features" aria-labelledby="features-title">
      <div className="ist-section-heading">
        <span className="ist-section-kicker">Creative System</span>
        <h2 id="features-title">一个商品，<br />一次生成完整视觉资产。</h2>
        <p>从单张商品图到一套可投放素材，保持统一风格与商品一致性。</p>
      </div>

      <div className="ist-bento-grid">
        <article className="ist-bento-card ist-bento-product">
          <div className="ist-bento-copy"><span><Image size={14} />AI Product Shot</span><h3>自动生成高质量商品主图</h3><p>统一光影、材质与构图，保持商品真实。</p></div>
          <div className="ist-bento-visual"><img src={imageAssets.hero} alt="" /></div>
        </article>

        <article className="ist-bento-card ist-bento-lifestyle">
          <div className="ist-bento-copy"><span><Sparkles size={14} />Lifestyle Scene</span><h3>放进真实生活场景</h3><p>从棚拍延展到空间、人物与使用氛围。</p></div>
          <div className="ist-bento-visual"><img src={imageAssets.lifestyle} alt="" /></div>
        </article>

        <article className="ist-bento-card ist-bento-detail">
          <div className="ist-bento-copy"><span><Layers3 size={14} />Detail Page</span><h3>自动生成详情页视觉</h3><p>把卖点、细节、规格与场景编排成完整内容。</p></div>
          <div className="ist-detail-mock" aria-hidden="true">
            <span /><span /><span />
          </div>
        </article>

        <article className="ist-bento-card ist-bento-campaign">
          <div className="ist-bento-copy"><span><Megaphone size={14} />Campaign Kit</span><h3>一套素材，多种投放</h3><p>广告、Banner、社媒与活动页一次生成。</p></div>
          <div className="ist-campaign-mock" aria-hidden="true">
            <i /><i /><i />
          </div>
        </article>

        <article className="ist-bento-card ist-bento-brand">
          <div className="ist-bento-copy"><span><Palette size={14} />Brand Style</span><h3>保持品牌视觉一致性</h3><p>沉淀色彩、字体、光线与构图规则。</p></div>
          <div className="ist-brand-mock" aria-hidden="true">
            <span /><span /><span /><span />
            <b>Aa</b>
          </div>
        </article>

        <article className="ist-bento-card ist-bento-resize">
          <div className="ist-bento-copy"><span><Scaling size={14} />Smart Resize</span><h3>适配不同平台尺寸</h3><p>自动重组画面比例，不用逐张返工。</p></div>
          <div className="ist-resize-mock" aria-hidden="true">
            <span /><span /><span />
          </div>
        </article>
      </div>
    </section>
  )
}
