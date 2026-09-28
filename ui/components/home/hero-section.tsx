import { ArrowRight, Play, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { WorkspaceDemo } from './workspace-demo'

export function HeroSection() {
  return (
    <section className="ist-hero" aria-labelledby="home-title">
      <div className="ist-hero-copy">
        <span className="ist-eyebrow"><i /><Sparkles size={14} />AI E-commerce Creative Studio</span>
        <h1 id="home-title">让每一个商品，<br /><span>都拥有自己的视觉团队。</span></h1>
        <p>上传商品素材，AI 自动生成主图、详情页、广告素材与完整视觉方案。</p>
        <div className="ist-hero-actions">
          <Link className="ist-button ist-button-primary" href="/workbench?mode=general">开始创作 <ArrowRight size={16} /></Link>
          <a className="ist-button ist-button-secondary" href="#showcase"><Play size={14} /> 查看案例</a>
        </div>
        <div className="ist-hero-proof">
          <span><b>4</b> 类工作流</span>
          <span><b>16</b> 张批量生成</span>
          <span><b>4K</b> 高清输出</span>
        </div>
      </div>
      <WorkspaceDemo />
    </section>
  )
}

