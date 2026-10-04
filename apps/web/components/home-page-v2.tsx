import { BrandMark } from './brand'

/**
 * 首页新方案（预览用，挂在 /home-v2）：模仿 Duolingo「Super」活动页第一屏——
 * 深色星空 + 一枚贴纸风 3D 主视觉浮在白云之上，下方白底放标题与单个大按钮，
 * 不放输入框，点按钮直接进工作台。旧版首页（/）保持不变，供对比后再决定。
 */
export function HomePageV2() {
  return (
    <div className="hv2">
      <header className="hv2-sky">
        <div className="hv2-brand">
          <BrandMark size={30} />
          <strong>iStudio</strong>
        </div>

        <div className="hv2-art-wrap">
          {/* 主视觉：贴纸风 3D 插画（白描边），浮在云层之上 */}
          <img className="hv2-art" src="/backgrounds/hero-v2.png" alt="" draggable={false} />
        </div>

        {/* 云朵分隔：白色扇形边缘，把深色天空与下方白底衔接起来 */}
        <svg className="hv2-cloud" viewBox="0 0 1440 240" preserveAspectRatio="none" aria-hidden="true">
          <path
            fill="#ffffff"
            d="M0,240 L0,150 C110,150 150,74 288,84 C372,90 414,132 512,124 C614,116 636,52 760,66 C862,78 902,132 1004,124 C1122,115 1160,60 1284,78 C1364,90 1402,132 1440,132 L1440,240 Z"
          />
        </svg>
      </header>

      <main className="hv2-body">
        <h1 className="hv2-title">让创意拥有视觉</h1>
        <p className="hv2-sub">面向电商团队的 AI 图片创作工作台，一句话生成专业商品视觉。</p>
        <a className="hv2-cta" href="/workbench">进入工作台，开始创作</a>
      </main>
    </div>
  )
}
