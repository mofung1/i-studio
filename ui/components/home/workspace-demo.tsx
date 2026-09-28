import { Check, Image, LayoutGrid, Sparkles, WandSparkles } from 'lucide-react'

import { imageAssets } from './home-data'

export function WorkspaceDemo() {
  return (
    <figure className="ist-workspace" aria-label="iStudio AI 电商视觉生成工作流演示">
      <div className="ist-workspace-toolbar">
        <div className="ist-workspace-brand">
          <span className="ist-workspace-mark"><WandSparkles size={14} /></span>
          <div><strong>iStudio Agent</strong><span>Product visual workflow</span></div>
        </div>
        <span className="ist-workspace-status"><i /> 生成中 · 82%</span>
      </div>

      <div className="ist-workspace-body">
        <div className="ist-workspace-input">
          <div className="ist-demo-label"><Image size={13} /> 商品素材</div>
          <div className="ist-source-image"><img src={imageAssets.hero} alt="腕表商品原图" /></div>
          <div className="ist-brief-card">
            <span><Sparkles size={13} /> Creative brief</span>
            <p>极简棚拍，柔和侧光，突出腕表材质与细节，适合高端电商主图。</p>
          </div>
          <div className="ist-demo-tags"><span>主体识别</span><span>材质理解</span><span>风格统一</span></div>
        </div>

        <div className="ist-workspace-output">
          <div className="ist-output-head">
            <span><LayoutGrid size={13} /> 输出画布</span>
            <b>4 VISUALS</b>
          </div>
          <div className="ist-output-grid">
            <div className="ist-output-card ist-output-card-main">
              <img src={imageAssets.hero} alt="腕表商品主图生成结果" />
              <span>Hero · 1:1</span>
            </div>
            <div className="ist-output-card">
              <img src={imageAssets.lifestyle} alt="商品生活场景生成结果" />
              <span>Lifestyle · 4:5</span>
            </div>
            <div className="ist-output-card">
              <img src={imageAssets.social} alt="商品社媒广告生成结果" />
              <span>Social · 9:16</span>
            </div>
            <div className="ist-output-card">
              <img src={imageAssets.campaign} alt="商品营销 Banner 生成结果" />
              <span>Banner · 16:9</span>
            </div>
          </div>
          <div className="ist-generation-progress">
            <div><span /><b>82%</b></div>
            <p><Check size={13} /> 已完成商品识别与视觉方向匹配</p>
          </div>
        </div>
      </div>
    </figure>
  )
}

